# APP NAFTA 3.0

App web (HTML/CSS/JS, sin instalar nada) para controlar todos los gastos de los autos de la familia: combustible, mantenimiento, seguro, VTV, reparaciones, neumáticos, lavadero, etc. Cada integrante tiene su usuario y todos ven los mismos datos desde su celular.

## Usarla sin internet (solo en este celular o PC)
Abrí `index.html` en el navegador. Los datos se guardan en el equipo. Con "Más → Ajustes" podés exportar/importar respaldos JSON.
Para cargar tus 3 autos y 11 cargas históricas: botón **Cargar mis 3 autos y 11 cargas** (Inicio).

## Activar la cuenta familiar (Supabase, gratis)
1. Creá un proyecto en https://supabase.com.
2. SQL Editor → pegá y ejecutá todo `supabase/setup.sql`.
3. (Recomendado) Authentication → Providers → Email → desactivá "Confirm email" para que cada persona entre sin confirmar correo.
4. Settings → API: copiá la **Project URL** y la clave **anon / publishable**.
5. Pegalas en `js/config.js` (así quedan fijas para todos) o en la app, en Ajustes → Cuenta.
6. Publicá la carpeta en un hosting estático (Netlify, GitHub Pages, Cloudflare Pages…) para que todos abran el mismo enlace. Necesita HTTPS.
7. El **administrador** abre la app, crea su cuenta y la familia. En "Familia" aparece el **código de invitación** (y un enlace `?codigo=XXXX`).
8. Cada integrante crea su cuenta, elige "Unirme con un código" y listo.

## Seguridad
- Cada persona tiene email + contraseña propios (Supabase Auth).
- Las reglas de la base (RLS) hacen que solo los integrantes de una familia vean sus datos. El código de invitación solo lo ve el administrador; si se filtra, generá uno nuevo.
- El administrador puede quitar integrantes y dar permisos de administrador.
- La clave "anon/publishable" es pública por diseño; nunca pongas la clave `service_role`.

## Cómo sincroniza
Primero guarda en el equipo y luego sube/baja por registro (al abrir, al guardar y cada 20 s). Sin internet seguís cargando y se sube al volver. Si dos personas editan el mismo registro, gana la edición más reciente (depende de que los relojes de los celulares estén en hora).

## Qué incluye
Inicio (resumen y alertas), carga rápida de combustible, gastos de todo tipo, mantenimiento con alertas por fecha/km, fichas de vehículos, estadísticas (gasto mensual por auto, evolución del precio, rendimiento, costo por km), gastos por integrante, actividad (quién agregó/modificó/eliminó) y exportación CSV/JSON.

## Qué NO incluye (todavía)
Fotos de tickets, estaciones favoritas, presupuestos y exportación a Excel (.xlsx; el CSV abre en Excel).

## Archivos
`index.html`, `css/`, `js/`, `supabase/setup.sql`, `datos-iniciales.json`.
