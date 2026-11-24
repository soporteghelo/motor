# MOTOR PWA ZERO-TOUCH — Guía para Claude

## Qué es este proyecto

PWA Enterprise sobre Google Apps Script. Frontend SPA en un solo `Index.html` con módulos HTML inyectados. Backend en `00_Config/Code.gs` (Zero-Touch Engine). No usa frameworks — solo Tailwind CSS + Material Symbols + JS nativo.

---

## Arquitectura general

```
MOTOR/
├── .claude/skills/         ← Skills de desarrollo (builder, design, runtime + CATALOGO.md)
├── 00_Config/              ← NÚCLEO del motor
│   ├── Code.gs             ← Backend ÚNICO (Zero-Touch Engine, Drive autodiscovery)
│   ├── Index.html          ← Shell SPA principal — NO tocar estructura base
│   ├── Global_Config.js.html   ← AppState global, colores, sesión
│   ├── Global_Skills.js.html   ← PWA_SKILLS API (todas las funciones reutilizables)
│   ├── Motor_Render.js.html    ← MOTOR_RENDER: genera Resumen/Edicion/Detalle desde el subconfig
│   ├── Offline_Engine.js.html  ← IndexedDB + cola offline
│   ├── PDF_Templates.js.html   ← Informe PDF del registro: visor, archivo en Drive/Storage y envío
│   ├── Face_Capture.js.html    ← Cámara frontal + detección de rostro
│   ├── Consentimiento.js.html  ← Asistente de primer ingreso (datos + selfie + firma)
│   ├── Face_Capture.js.html    ← FACE_CAPTURE: cámara frontal, detección de rostro y toma automática
│   ├── App_Routing.js.html     ← Router SPA + login + menu dashboard
│   ├── 000_Docs/           ← Documentación interna
│   └── 001_Configuraciones/    ← Módulo de config del sistema
├── 00_Admin/               ← Módulo SuperAdmin
├── 01_Usuarios/            ← Módulo usuarios + auth
├── 02_Reportes/            ← Módulo reportes
├── 03_Inspecciones/        ← Módulo inspecciones (ejemplo con CHILD_TABLE)
├── generate_preview.js     ← Build: genera LOCAL_PREVIEW.html y PROD_INDEX.html
├── build_web.js            ← Build web (Vercel): genera dist/ (npm run build)
├── web/                    ← Estáticos de la PWA web: sw.js, manifest, iconos
├── api/usuarios.js         ← Función serverless (Vercel): alta de cuentas y contraseñas
├── vercel.json             ← Build, salida dist/, cabeceras de seguridad
├── server.js               ← Servidor local de preview
├── capacitor.config.json   ← App instalable Android/iOS (webDir: dist)
├── android/                ← Proyecto nativo (lo genera `npx cap add android`; no se versiona)
├── tools/apk_build.js      ← Compila el APK buscando el JDK y el SDK solos
├── tools/ota_publish.js    ← Publica el dist/ como actualización por aire
├── tools/ota_zip.js        ← Empaquetador ZIP determinista, sin dependencias
├── tools/vendor_cdn.js     ← Baja Tailwind, fuentes, iconos y SheetJS a web/vendor/
├── web/vendor/             ← Esas librerías, versionadas: la app abre sin señal
└── PROD_INDEX.html         ← HTML final bundleado para pegar en GAS
```

**Cada módulo es UN archivo:**
- `subconfig_XX_Nombre.js.html` — datos (`Variables`), permisos (`Config_Modular`),
  presentación (`Vistas`) y, si hace falta, lo propio del módulo (`MOTOR_HOOKS`).

`MOTOR_RENDER` dibuja Resumen, Edición y Detalle leyendo ese archivo. Los nueve
módulos de trabajo (02 a 10) no tienen HTML propio. Solo `01_Usuarios` y
`00_Admin` conservan vistas a mano, porque crean cuentas por `/api/usuarios`
en vez de por la cola offline.

**Archivo `Mod_XX_Nombre_Vista.html` (excepcional):** si existe con
`id="module-xx_nombre-vista"`, el router lo prefiere sobre el motor. Es el
último recurso, cuando ni `Vistas` ni un gancho alcanzan.

---

## Flujo de build

```bash
node generate_preview.js   # Lee Index.html, resuelve todos los <?!= include() ?>, genera PROD_INDEX.html
```

`generate_preview.js` busca archivos en este orden:
1. `MOTOR/<filename>` (ruta absoluta desde raíz)
2. Fallback: `MOTOR/00_Config/<filename>`

**Después de cualquier cambio** en `00_Config/` o módulos, ejecutar el build antes de probar o desplegar.

```bash
npm run build              # build_web.js → dist/ (lo que despliega Vercel)
npm test                   # RLS + Apps Script + vistas generadas + captura facial + permisos + OTA
npm run test:rostro        # solo la captura facial (panel, respaldo sin cámara, foto de perfil)
npm run test:ota           # solo la actualización por aire (ver "App instalable")
npm run test:sync          # cola sin conexión: que lo guardado acabe subiendo
npm run test:informes      # informe PDF: visor, archivo automático, borrado y envío
```

Dos suites del `npm test` (`test:seed` y `test:empresas`) necesitan
`00_Config/Seed_Demo.gs`, que no está en el repositorio: fallan por eso, no
por el código. Las demás se pueden ejecutar una por una.

`test:rls` necesita PGlite y las suites de DOM necesitan jsdom. Se instalan
sin tocar `package.json`:

```bash
npm i --no-save @electric-sql/pglite@0.2.17 jsdom@24.1.3 fake-indexeddb@6.0.0
```

**Las tres van en el MISMO comando.** `npm i --no-save X` reinstala desde
`package.json` y se lleva por delante lo instalado antes con `--no-save`.

`build_web.js` resuelve los mismos includes, quita las etiquetas `<?= ?>` de Apps Script, **no** inyecta el mock de `google.script.run`, inyecta `window.__MOTOR_ENV__` (SUPABASE_URL / SUPABASE_ANON_KEY desde variables de entorno; si faltan usa las de `Global_Config.js.html`) y copia `web/` (manifest, iconos, service worker). Falla si queda un include sin resolver o si la anon key resulta ser una service_role.

## Despliegue en Vercel

Proyecto estático (`framework: null`, salida `dist/`) + una función serverless en `api/`. Variables de entorno en Vercel:

| Variable | Dónde se usa | Visibilidad |
|---|---|---|
| `SUPABASE_URL` | navegador + `api/usuarios.js` | pública |
| `SUPABASE_ANON_KEY` | navegador | pública (RLS la protege) |
| `SUPABASE_SERVICE_ROLE_KEY` | solo `api/usuarios.js` | **secreta**, nunca al frontend |

El service worker (`web/sw.js`) solo cachea el cascarón (HTML, iconos, CDN). Supabase y `/api/*` van siempre a red: los datos offline viven en IndexedDB (`Offline_Engine`).

---

## App instalable (Android / iOS) y actualización por aire

La misma PWA se empaqueta con **Capacitor 8** como app instalable. No hay un
segundo código: el `dist/` que despliega Vercel es el que vive dentro del APK.
Registrar sin conexión sigue funcionando igual, porque `Offline_Engine` usa
IndexedDB y eso es idéntico dentro del WebView.

```bash
npm run vendor             # baja las librerías a web/vendor/ (ya están; -f rehace)
npm run apk                # build + cap sync + APK de depuración → .apk/
npm run apk -- --release   # APK firmado para entregar (necesita keystore)
npm run ota:dry            # empaqueta y calcula el hash, sin subir nada
npm run ota:publish        # sube el bundle y mueve latest.json
npm run deploy             # build + ota:publish
```

`tools/apk_build.js` localiza el JDK (el que trae Android Studio) y el SDK sin
que estén en el `PATH`, y escribe `android/local.properties`. En Windows llama
a `gradlew.bat` a través de `cmd.exe`: Node no ejecuta un `.bat` directamente.

### Cómo llegan los cambios a una app ya instalada

Dentro de la app, el `dist/` es una carpeta que lee el WebView. Actualizar es
descargar otra carpeta y decirle que la próxima vez arranque desde ahí — **el
APK no se reinstala**. Lo hace `00_Config/OTA_Updater.js.html` con
`@capgo/capacitor-updater` (MPL-2.0), **sin la nube de Capgo**:
`updateUrl` y `statsUrl` van vacíos en `capacitor.config.json`, así que el
plugin solo habla con tu Supabase y no sale telemetría a terceros.

| Qué cambias | ¿Basta el OTA? |
|---|---|
| Módulo nuevo, campo, vista, gancho, PDF, filtros | **Sí** |
| RLS, SQL, matrices de rol | Inmediato, ni OTA hace falta (es servidor) |
| Plugin nativo, permiso de Android/iOS, icono, nombre | **No**: APK nuevo |

El orden al publicar un módulo importa: **primero el SQL**, después el bundle.
Así nunca hay un cliente pidiendo una tabla que todavía no existe.

### El flujo, pieza por pieza

1. `npm run build` escribe `dist/ota-version.json` con
   `<versión de package.json>-<buildId>`. Es **determinista**: el mismo código
   da la misma versión y el mismo zip. De eso depende que la publicación se
   pueda verificar, así que **ese archivo no lleva fecha** a propósito.
2. `tools/ota_publish.js` empaqueta `dist/` con `tools/ota_zip.js`, calcula su
   SHA-256 y lo sube a los **adjuntos de la publicación fija `ota`** del
   repositorio de GitHub (`bundle-<versión>.zip`, inmutable, y `latest.json`,
   que sí se reemplaza). Después vuelve a descargar lo publicado y compara el
   hash: si no cuadra, falla.
3. El cliente llama a `notifyAppReady()` al arrancar. **Si no lo llama, el
   plugin revierte solo al bundle anterior**: es la red de seguridad contra
   publicar algo roto.
4. Lee `latest.json`, y si la versión difiere descarga el zip pasando el
   `sha256`. El plugin lo **verifica en nativo y lo exige**: un bundle que no
   cuadre se borra y nunca se ejecuta.
5. Activa con `next()`, no con `set()`: se aplica en el **siguiente arranque**.
   Recargar en caliente borraría el formulario que alguien esté llenando en
   campo, puede que sin señal.

`latest.json` admite `minNativa`. Si el bundle necesita código nativo nuevo,
se pone ahí la versión de APK mínima (`npm run ota:publish -- --min-nativa=1.6.0`)
y los dispositivos con un APK anterior **no lo aplican**: avisan de que hay
que reinstalar, en vez de quedarse en blanco.

### Dónde se alojan y quién puede publicar

En los **adjuntos de la publicación `ota`** del repositorio de GitHub. Es
gratis, sirve el binario tal cual y no engorda el historial de git (los
adjuntos se guardan aparte). El repositorio debe ser **público**: el teléfono
descarga sin iniciar sesión, y los adjuntos de un repositorio privado piden
autenticación que el plugin no tiene.

GitHub responde a esas URL con un 302 hacia `release-assets.githubusercontent.com`.
No es problema: OkHttp (el cliente del plugin) sigue redirecciones por
defecto, y el salto es https, así que pasa el `httpsOnly` del plugin.

Para publicar hace falta **escritura en el repositorio**: `gh auth login` una
vez, o `GH_TOKEN` en un CI. Nadie más puede: aquí vive código ejecutable, y
quien pueda escribir ahí ejecuta lo que quiera en los teléfonos de la empresa.
Un XSS o un token de sesión robado no alcanzan.

Dos sitios tienen que coincidir, y `npm run test:ota` lo comprueba:

| Qué | Dónde | Para qué |
|---|---|---|
| De dónde **descarga** la app | `AppState.OTA.URL` en `Global_Config.js.html` (o `OTA_URL` del entorno) | Lo lee el teléfono |
| Dónde **publica** el script | Remoto `origin` de git (o `OTA_GITHUB_REPO`) | Lo usa tu máquina |

**Alternativa con Supabase Storage:** `npm run ota:publish -- --supabase`,
con el bucket de `tools/supabase_09_ota.sql` (lectura pública, escritura por
ninguna política: solo la `service_role`). Quedó como opción tras migrar a
Apps Script; el proyecto de Supabase del código ya no existe.

### Dos cosas que no son obvias

- **El service worker se desactiva dentro de Capacitor** (`!window.Capacitor`
  en `build_web.js`). Si no, serviría caché vieja justo después de aplicar un
  bundle nuevo. Por eso las librerías van empaquetadas (siguiente punto): sin
  service worker, un Tailwind que viniera de internet dejaría la pantalla sin
  estilos la primera vez que alguien abre la app sin señal.
- **Nada se carga de un CDN.** `npm run vendor` (`tools/vendor_cdn.js`) baja
  Tailwind, SheetJS, la tipografía Archivo y los iconos a `web/vendor/`, con
  versión fija y versionados en el repositorio. `00_Config/Index.html` **sigue
  apuntando al CDN** —`PROD_INDEX.html` es un único HTML y allí no hay
  archivos sueltos que referenciar— y `build_web.js` reescribe esas etiquetas
  a `/vendor/…` solo en `dist/`. Si una etiqueta cambia y deja de reconocerse,
  el build falla en vez de publicar una app que se rompe sin señal.
  - La fuente de iconos completa pesa 3,9 MB e iría en **cada** bundle OTA.
    Se pide subconjuntada (`icon_names`): 138 KB. La lista sale del código, no
    se escribe a mano, y queda en `web/vendor/iconos.txt`.
  - **Al usar un icono nuevo hay que ejecutar `npm run vendor -- -f`.**
    `npm run test:ota` falla si no se hizo: el icono se vería como texto.
  - MediaPipe (`cdn.jsdelivr.net`) se queda en línea a propósito: son varios
    MB y `Face_Capture` degrada solo a «Usa la cámara del teléfono».
  - En el navegador sí hay service worker, y precachea `/vendor` (la lista la
    inyecta `build_web.js` en `__VENDOR__` de `web/sw.js`).
- **La CSP viaja como `<meta>`, no solo como cabecera.** Dentro del WebView no
  hay cabeceras HTTP, así que la cabecera de `vercel.json` no llegaría nunca.
  `build_web.js` **deriva una `<meta http-equiv="Content-Security-Policy">` de
  esa misma cabecera** y la inyecta justo después del `charset`. Un solo sitio
  que tocar: añade el CDN a `vercel.json` y la meta se actualiza sola.
  - En Vercel se aplican las dos (la efectiva es la intersección, y son la
    misma política).
  - En la app instalada la meta es la **única** CSP, y es lo que impide que un
    XSS se lleve el token de sesión de `localStorage`.
  - `PROD_INDEX.html` (Apps Script) no la lleva: lo genera
    `generate_preview.js`, que no pasa por `build_web.js`. El iframe de Google
    sigue funcionando igual.
  - `frame-ancestors`, `report-uri`, `report-to` y `sandbox` se descartan al
    pasar a meta: el estándar las ignora ahí. Contra el clickjacking sigue
    valiendo la cabecera de Vercel, que sí las conserva.
  - `npm run test:ota` comprueba que meta y cabecera no divergen, que la meta
    va antes del primer recurso externo y que **todo origen externo del HTML
    está permitido**: añadir un CDN y olvidar la CSP rompe la prueba en vez de
    romper la app en producción.

### iOS

`capacitor.config.json` ya sirve para iOS: `npx cap add ios` en un Mac. Hace
falta la cuenta de Apple Developer (99 USD/año) porque Apple no permite
instalar fuera de la App Store. Sin ella, en iOS se usa la PWA (*Compartir →
Añadir a inicio*), que conserva el registro sin conexión y se actualiza con
cada despliegue. Nota: el PDF por `window.print()` es flojo en Safari.

---

## Fotos: cámara y galería en todo campo de imagen

Todo campo `Image` / `Image_Collection` se dibuja con **dos botones y dos
entradas de archivo**, en `MOTOR_RENDER.campoHTML()`. Un módulo nuevo lo
hereda sin escribir nada.

| Botón | Entrada | Para qué |
|---|---|---|
| Cámara | `id + '-cam'`, con `capture="environment"` | Abre la cámara trasera. Una foto cada vez (nunca `multiple`) |
| Galería | `id`, **sin** `capture` | Elegir fotos ya tomadas; conserva `multiple` en `Image_Collection` |

**Por qué dos y no una.** Dentro del APK, el selector de archivos de Capacitor
no ofrece la cámara: solo lanza `ACTION_IMAGE_CAPTURE` cuando la entrada trae
`capture` (`BridgeWebChromeClient`). Y poner `capture` en la única entrada
quitaría el acceso a la galería, que también hace falta. Las dos mandan al
mismo sitio (`MOTOR_RENDER.tomarArchivos`, que lee `dataset`, no el id).

**Permiso de cámara.** El manifiesto declara `CAMERA` y
`uses-feature … required="false"`. Lo necesita `Face_Capture` (usa
`getUserMedia`): Capacitor pide el permiso en caliente, pero Android no
concede uno que no esté declarado, así que sin esa línea la captura de rostro
falla dentro del APK. `required="false"` es obligatorio al declarar `CAMERA`,
o Google Play ocultaría la app a los dispositivos sin cámara.

Como `android/` **no se versiona** (lo regenera `npx cap add android`), ese
ajuste lo reaplica `tools/apk_build.js` en cada compilación, de forma
idempotente. Cualquier otro cambio nativo va en el mismo sitio, o se pierde.

`npm run test:render` recorre los campos de imagen de **todos** los módulos y
falla si alguno se queda sin cámara o sin galería.

---

## Cola sin conexión: reglas que no se pueden romper

`00_Config/Offline_Engine.js.html`. Lo que se guarda en campo **siempre** tiene
que acabar en el servidor sin que nadie pulse nada. Dos distinciones lo
sostienen, y confundirlas pierde datos en la práctica:

**Transitorio ≠ rechazado.** Un fallo de red, una sesión caducada o un
servidor caído significan «no se pudo preguntar»: **no suman rechazos**. Un
rechazo real del servidor (dato inválido, permiso, RLS) sí suma, y a los
`SYNC_MAX_RECHAZOS` el registro queda *bloqueado*: sigue guardado en el
dispositivo, pero el envío automático lo salta. El proveedor ya clasifica el
fallo en `result.transitorio`; **hay que respetarlo**. Tratar un corte de red
como rechazo hace que un trabajador sin señal gaste los cinco intentos y
pierda el envío automático para siempre — ese fallo existió y
`rehabilitarBloqueadosPorRed()` recupera al arrancar lo que quedó así.

**`navigator.onLine` no es de fiar dentro del APK.** El WebView de Android no
lo actualiza sin el plugin de red: vale siempre `true` y el evento `online`
no llega nunca. Por eso el reintento periódico **no lo consulta**: intenta y,
si no hay señal, el fallo es transitorio y no cuenta. Solo se le hace caso en
el navegador (`enAppInstalada()` distingue uno de otro).

La cabecera lleva **dos señales de sincronía y no se mezclan** (es una sola
cabecera, en `Index.html`, compartida por todos los módulos):

| Señal | Dónde | Qué dice |
|---|---|---|
| Número de pendientes | `#ui-sync-badge`, sobre el botón de sincronizar | Cuántos cambios NO han llegado al servidor |
| Pastilla de estado | `#ui-sync-chip`, a la derecha | **Una palabra**: Conectado · Sin conexión · Con error · Enviando… |

Las mantiene `updateSyncUI(texto, offline, pendientes)`. **El texto de estado
no lleva cifras**: «Sin conexión · 3 pendiente(s)» partía la cabecera en dos
líneas en el móvil y tapaba el título del módulo; `npm run test:sync` falla si
vuelve a hacerlo. **Sin número = todo llegó al servidor**, que es la señal que
busca el usuario antes de cerrar la app. Los colores de la cabecera no se
invierten con el tema porque siempre es marino. Por debajo de 480 px la
pastilla se queda solo con el punto de color, y el texto sigue ahí para el
lector de pantalla.

**El botón de sincronizar se ve en toda la app con sesión abierta**, módulos y
panel principal incluidos; solo desaparece en el Login. Es el único control de
actualización que existe: el panel tenía el suyo (`.mnu-refresh`) y se retiró.
Sube la cola y después recarga el Resumen del módulo activo o, en el panel, sus
indicadores. **Al pulsarlo el icono gira desde el primer momento y durante un
mínimo de 650 ms**, aunque la subida acabe en 80 ms: es la señal de que se está
forzando la actualización. Gira el icono (`.sincronizando`), nunca el botón, o
el número de pendientes daría vueltas con él.

`npm run test:sync` cubre todo esto sobre el motor real con un IndexedDB
simulado. Está comprobado que detecta el fallo descrito: con el código
anterior, cuatro de sus pruebas fallan.

---

## Backend (Code.gs) — Zero-Touch Engine

**Acciones disponibles:**
| Action | Descripción |
|---|---|
| `READ_DB` | Lee todos los registros. **No lo use un Resumen**: no escala a miles |
| `QUERY_DB` | Una **página** filtrada en el servidor (`filtros`, `busqueda`, `cond`, `pageSize`, `desde`). Lo que usa todo Resumen |
| `COUNT_DB` | Cuántas filas cumplen una condición, sin devolver ninguna |
| `AGG_DB` | `count` / `sum` / `max` / `min` / `avg` sobre todas las filas visibles |
| `AGG_BATCH` | Varios agregados en **una** petición (la fila de KPIs). Lee la hoja una sola vez |
| `READ_DELTA` | Lee solo registros nuevos desde `lastSyncDate` |
| `SYNC_OFFLINE_QUEUE` | Inserta lote desde cola offline (requiere `subconfig`) |
| `DELETE_ROWS` | Elimina en cascada padre + hijos por UUID |
| `SYSTEM_HEALTH_CHECK` | Valida paridad entre subconfig y columnas del Sheets |
| `LOGIN_AUTH` | Autenticación con hash SHA-256 |
| `SAVE_CONSENT` | Archiva la constancia de firma digital en `DATA/01_Usuarios/00_Usabilidad/<EMPRESA>/<DNI>.pdf` |
| `SAVE_REPORT` | Archiva el informe PDF del registro en `DATA/<modulo>/00_Informes/<uuid>.pdf` (sustituye el anterior) |
| `DELETE_REPORT` | Retira el informe PDF de un registro |
| `GET_REPORT` | Si hay informe: su fecha y su enlace; con `compartir: true`, lo abre por enlace para poder enviarlo |

**Autodiscovery**: El backend localiza cada módulo buscando una carpeta por nombre en Drive (`ROOT_APP_FOLDER_ID`). El Spreadsheet de cada módulo vive dentro de esa carpeta.

**Seguridad**: `authSessionGuard()` bloquea usuarios con Status `CESADO` o `INACTIVO` en cada request (excepto `LOGIN_AUTH`).

### Datos de demostración (`00_Config/Seed_Demo.gs`)

Archivo aparte que se pega en el mismo proyecto de Apps Script, junto a `Code.gs`.
Usa sus mismos ayudantes (`leerTabla_`, `agregarFilas_`, `hashPassword_`), así que
no duplica lógica ni toca el esquema.

| Función | Qué hace |
|---|---|
| `_SembrarDatosDemo()` | 40 personas + 40 registros por módulo con su detalle (≈1 870 filas), repartidos en los últimos 6 meses |
| `_BorrarDatosDemo()` | Quita exactamente lo sembrado y nada más |
| `_ResumenDatosDemo()` | Cuenta cuántas filas de demostración hay por pestaña |

Todo lo sembrado lleva un UUID que empieza por `d0d0d0d0-` (hexadecimal válido,
así pasa los mismos filtros que un UUID real). Ese prefijo es lo que permite
borrarlo después sin tocar un registro de verdad, y lo que hace que sembrar dos
veces avise en vez de duplicar.

Los datos salen de un generador con semilla fija: dos ejecuciones producen el
mismo conjunto. Los valores respetan los `acceptedValues` de cada subconfig y
los totales calculados cuadran con su detalle. Las columnas de fotos y firmas
quedan vacías a propósito: un script no debe fabricar archivos en tu Drive.

**Las 40 cuentas inician sesión de verdad** (DNI 71000001–71000040, contraseña
`Demo2026`). Es para una hoja de pruebas, no para la base de un cliente.

Se verifica con `npm run test:seed`, que ejecuta el script sobre el simulador de
Sheets y comprueba enums, coherencia de totales, alcance por rol y que el
borrado no se lleve nada real.

### Empresas contratistas (`00_Config/Seed_Empresas.gs`)

Segundo archivo que se pega junto a `Code.gs`. Rellena las dos columnas que
delimitan el alcance por empresa:

| Columna | Dónde | Quién la pone |
|---|---|---|
| `Empresa` | `01_Usuarios` | El Admin, desde el formulario |
| `Empresa` | Módulos 02–07, 09, 10 | El servidor, al crear el registro |
| `Empresa_Registro` | Solo `08_PETAR` | El servidor, al crear el registro |

`_AsignarEmpresas()` reparte al personal (Admin → empresa titular; supervisores
y trabajadores en rotación, garantizando un supervisor por empresa) y etiqueta
los registros que ya existían con la empresa de quien los creó. Solo escribe en
celdas vacías y el reparto es determinista por DNI. `_QuitarEmpresas()` lo
deshace; `_ResumenEmpresas()` solo informa. Se verifica con
`npm run test:empresas`.

**Por qué dos nombres**: `08_PETAR` ya tiene un campo `Empresa` suyo —la
contratista que ejecuta el trabajo, que escribe el usuario—. Compartir columna
habría hecho que el servidor pisara ese dato del formulario, así que el
generador le da `Empresa_Registro` solo a ese módulo y anota la elección en
`ESQUEMA.modulos[id].columnaEmpresa`. El backend lee de ahí (`colEmpresa_()`) y
publica el valor al frontend siempre como `empresa_registro`, venga de la
columna que venga. Un módulo nuevo que declare un campo `Empresa` recibe el
mismo trato solo. **Nunca hay que renombrar columnas a mano.**

---

## Miles de registros: cómo se consulta

**Un Resumen no carga la tabla: carga una página de 50 filas y pregunta el
total.** `DataService.read()` sigue existiendo para quien necesite todo (REF,
sincronización), pero una vista que lo use no escala: en Supabase PostgREST
corta en seco a las 1 000 filas (`db-max-rows`) y devuelve `status: OK` sin
avisar, y en Apps Script agota el tiempo de ejecución.

| Qué | Con qué |
|---|---|
| Una página filtrada | `DataService.query(modulo, { filtros, busqueda, cond, limite, desde, orden })` |
| Un número exacto | `DataService.count(modulo, { cond })` |
| Suma, máximo, mínimo | `DataService.aggregate(modulo, { metrica, campo, cond })` |
| Varios números de golpe | `DataService.aggregateBatch(modulo, [{ metrica, campo, cond }, …])` |

`MOTOR_RENDER` lo gestiona solo: estado por módulo en `MOTOR_RENDER._pag`,
`cargarMas()`, pie con «Mostrando 50 de 3 480», y orden por cabecera delegado
al servidor (ordenar solo la página cargada da un orden que parece global y no
lo es).

### Lenguaje de condiciones

La MISMA condición se evalúa en tres sitios, y por eso es pobre a propósito:

```javascript
cond = { Estado_Actual: { neq: "Cerrado" }, Plazo: { lt: "@hoy" } }
```

| Dónde | Quién la traduce |
|---|---|
| Postgres | `SupabaseProvider._condicionesPG` → PostgREST · `motor_cond_sql()` → SQL |
| Sheets | `filtrarFilas_()` en `Code.gs` |
| Navegador (sin conexión, `01_Usuarios`) | `FILTRO_LOCAL` en `DataProvider.js.html` |

Operadores: `eq` `neq` `lt` `lte` `gt` `gte` `like` `in` `nulo`, más `$o` para
alternativas (`$o: [condA, condB]` = cumple una u otra). Comodines, resueltos
en el navegador antes de salir: `@hoy` `@hoy-30` `@hoy+7` `@mes` `@mes+1`
`@hora`. **Un valor nulo no cumple ninguna desigualdad**: una inspección sin
plazo no está vencida.

Si se añade un operador, hay que añadirlo en los tres sitios o el mismo KPI
dará números distintos según el proveedor activo.

### KPIs: se cuentan en la base, nunca en pantalla

Esto es lo que permite paginar sin romper los tableros. Un KPI declara su
condición y `MOTOR_RENDER.kpis()` pide el número al servidor:

```javascript
MOTOR_RENDER.kpis("03_Inspecciones", [
  { tono: "mute", etiqueta: "Inspecciones",  cond: {} },
  { tono: "bad",  etiqueta: "Plazo vencido", cond: { Estado_Actual: { neq: "Cerrado" }, Plazo: { lt: "@hoy" } } },
  { tono: "mute", etiqueta: "Peligros", metrica: "sum", campo: "Total_Peligros" },
  { tono: "ok",   etiqueta: "Días sin accidente", metrica: "max", campo: "Fecha_Evento",
    cond: { Tipo_Evento: { like: "tiempo perdido" } }, formato: f => diasDesde(f) },
  { tono: "info", etiqueta: "Ya calculado", valor: 7 }
]);
```

**Nunca contar con `ctx.filas`.** Con la tabla paginada eso deja fuera lo que
no está en pantalla: una inspección vencida de hace ocho meses está miles de
filas atrás y desaparecería del tablero sin ninguna señal. Pulsar la tarjeta
manda su misma `cond` al servidor, así que el registro antiguo aparece en la
lista por lejos que esté.

Sin conexión el número se calcula sobre la copia local y se marca con `~` y un
`title` que lo explica: un número incompleto presentado como exacto es peor
que no darlo.

### Índices (Postgres)

`tools/supabase_08_rendimiento.sql` (generado) crea, por módulo:
`(empresa_id, creado_en desc)` para el orden de la paginación, `(empresa_id,
campo)` para cada campo con filtro propio que sea fecha, número o enum, y un
índice GIN de trigramas (`pg_trgm`) para los filtros de texto, que son `ILIKE`
parcial y un btree no puede resolver. También `motor_agregado()` /
`motor_cond_sql()`, que son `security invoker`: **el RLS se les aplica igual
que a una consulta normal**, así que un trabajador cuenta solo lo suyo. No
cambiar a `security definer`.

Al añadir un módulo o un campo con filtro: `node tools/gen_supabase.js` y
aplicar 08. Sobre una tabla ya grande, cambiar `create index` por
`create index concurrently` (no se puede usar dentro de una transacción).

### Apps Script: funciona, pero tiene techo

Los dos proveedores exponen el mismo contrato y dan los mismos números (lo
comprueba `npm run test:appscript`). Lo que **no** es igual es el coste:

| | Supabase | Apps Script |
|---|---|---|
| Página del Resumen | índice `(empresa_id, creado_en desc)` | relee la hoja completa |
| Conteo de un KPI | índice, casi gratis | relee la hoja completa |
| Lo que gana paginar | consulta acotada **y** payload pequeño | solo payload pequeño |

**Una hoja de cálculo no tiene índices**, y `_MEMO` se vacía al empezar cada
petición ([Code.gs](00_Config/Code.gs), `serverRouter`), así que cada petición
lee la hoja entera con `getRange(...).getValues()`. Por eso los KPIs van
**agrupados** en `AGG_BATCH`: pedirlos sueltos hacía que un Resumen leyera la
hoja cinco veces (la página + cada KPI), más trabajo del que hacía la app antes
de paginar. Con el lote son dos lecturas: la página y los indicadores.

Aun así el coste por petición crece con el total de filas, no con las que se
devuelven. El techo práctico de Apps Script son **unos pocos miles de filas por
módulo**; para decenas de miles hay que usar Supabase, que es donde los índices
de `supabase_08_rendimiento.sql` hacen su trabajo.

### Copia local sin conexión

**Lo que se guarda sin conexión se ve en el acto.** Al encolar un registro,
`MOTOR_RENDER.guardar()` lo mete también en la copia local
(`MOTOR_CACHE.anteponer`) marcado como `_pendiente`, y el Resumen lo pinta
con el distintivo **«Por subir»**. Cuando la cola lo sube, el sincronizador
quita la marca (`MOTOR_CACHE.marcarSubidos`). Sin esto, la persona guardaba
en el campo, veía la lista vacía y volvía a escribir el mismo registro.

`MOTOR_CACHE` (en `Offline_Engine.js.html`) guarda la copia de consulta en
**IndexedDB**, no en localStorage: con diez módulos y miles de registros se
pasaban los ~5 MB del origen y el error se perdía en un `catch` vacío, así que
el modo sin conexión dejaba de guardar sin avisar. Tres niveles: memoria →
IndexedDB → un resumen recortado a 200 filas en `localStorage` (`refdata_<mod>`)
para las vistas que leen de forma **sincrona** al pintar (miniaturas, PDF,
Detalle), que no pueden esperar a IndexedDB. Esas usan
`MOTOR_CACHE.leerSync()`, que puede devolver menos filas que `leer()`.

---

## MOTOR_RENDER — las vistas se generan solas

`00_Config/Motor_Render.js.html` construye las tres vistas desde el subconfig.
El router las pide cuando el módulo no trae un `Mod_XX_*.html` propio, y
registra `loadResumen_X` / `loadEdicion_X` / `loadDetail_X` por su cuenta.

- **`Variables`** dice qué datos hay → de ahí salen el control de cada campo,
  el asterisco de obligatorio, la validación, los filtros y las columnas.
- **`Vistas`** (opcional) afina columnas, secciones, títulos y los colores de
  estado. Sin él, el motor deduce todo con valores razonables.
- **`MOTOR_HOOKS[modulo]`** lleva lo que no se puede deducir: indicadores,
  tableros, columnas calculadas y totales (`resumen`, `edicion`, `detalle`,
  `columnas`, `antesDeGuardar`). Se declara en el mismo subconfig, abriendo con
  `window.MOTOR_HOOKS = window.MOTOR_HOOKS || {};` porque los subconfigs se
  cargan antes que el motor.

Referencia completa (tipos de campo, forma de `Vistas`, ganchos, ids
generados): `.claude/skills/motor-pwa-builder/references/renderizador.md`.

**Agregar un campo** = una línea en `Variables` (y su nombre en la sección de
`Vistas.Edicion` si se quiere en un sitio concreto) + `node tools/gen_supabase.js`.
Llega solo al formulario, al detalle, al PDF y a los filtros.

---

## Estructura de Subconfig

Cada módulo define su esquema en `subconfig_XX.js.html`. Ejemplo mínimo:

```javascript
var SUBCONFIG_XX_NOMBRE = {
  Config_Modular: {
    NombreInterno: "XX_Nombre",
    DRIVE_FOLDER_NAME: "XX_Nombre_DB",      // Nombre de carpeta en Drive
    GOOGLE_DOC_TEMPLATE_ID: "",             // Heredado, sin uso: el PDF ahora es 100% interno (ver sección "Plantillas PDF")
    EMAIL_TEMPLATE_ID: "",                  // ID Google Docs para email
    PARENT_TABLE: "MAIN",                   // Nombre pestaña principal en Sheets
    CHILD_TABLE: "",                        // Pestaña hija (vacío si no hay)
    RELATIONAL_KEY: "UUID",                 // Llave relacional padre-hijo
    Card_Image: "Foto",                     // Columna cuya imagen va en el cuadrado de la tarjeta móvil ("" = solo icono; también ["A","B"]: la primera con valor). Sin declarar: primer campo Image/Image_Collection
    Card_Icon:  "description",              // Icono (Material Symbols) del cuadrado cuando el registro no tiene imagen
    Relational_Fields: [],                  // Esquema de filas dinámicas (tabla hija)
    AdminRole:      { canCreate: true,  canRead: true,  canUpdate: true,  canDelete: true },
    SupervisorRole: { canCreate: false, canRead: true,  canUpdate: false, canDelete: false },
    WorkerRole:     { canCreate: false, canRead: false, canUpdate: false, canDelete: false }
  },

  Variables: {
    "UUID":      { type: "Hidden_UUID", required: true,  isFilter: false },
    "Campo1":    { type: "Text",        required: true,  isFilter: true  },
    "CampoEnum": { type: "Enum", required: true, isFilter: true,
                   acceptedValues: ["Val1", "Val2"], allowOtherValues: false },
    "Foto":      { type: "Image",       required: false, isFilter: false },
    "Foto_ID":   { type: "Hidden",      required: false },
    "Foto_Path": { type: "Hidden",      required: false }
  }
};
```

**Tipos de campo disponibles:**
| Tipo | Descripción |
|---|---|
| `Hidden_UUID` | UUID auto-generado, nunca visible |
| `Hidden` | Campo oculto (para _ID y _Path de archivos) |
| `Text` | Input texto. DNI siempre tipo Text (no Number) |
| `Password` | Se hashea con SHA-256 antes de enviar |
| `Date` | Selector de fecha |
| `Enum` | Select con `acceptedValues`. Si `allowOtherValues: true`, agrega opción libre |
| `REF` | Select que carga datos de otro módulo. Usa `relationalDataOrigin` + `slice` |
| `Image` | Imagen única, comprimida en el cliente. Dos botones: **Cámara** y **Galería** (ver abajo) |
| `Image_Collection` | Varias imágenes. Igual: cámara (una cada vez) o galería (varias) |
| `Face_Photo` | Cámara frontal con detección de rostro: la foto se toma sola al encuadrar bien 3 s (ver «Captura facial»). Equivale a `Image` + `captura: "rostro"` |
| `Signature` | Pizarra de firma digital (canvas) |
| `File` | Upload de archivo general |

**Campo REF con filtro:**
```javascript
"Auditor_DNI": {
    type: "REF",
    relationalDataOrigin: "01_Usuarios",       // módulo origen
    slice: { column: "Rol", value: "Supervisor" }  // filtrar por columna=valor
}
```

---

## API de PWA_SKILLS (Global_Skills.js.html)

Funciones globales disponibles en el frontend:

| Función | Uso |
|---|---|
| `PWA_SKILLS.compressImage(file, quality)` | Comprime imagen canvas ('Bajo'/'Medio'/'Alto') |
| `PWA_SKILLS.renderDriveMedia(val, id, containerId)` | Galería de archivos: rutas de Storage (las firma), URLs o dataURLs. No-imágenes → tarjeta de descarga |
| `PWA_SKILLS.saveDraft(formId, moduleName)` | Guarda borrador en LocalStorage |
| `PWA_SKILLS.loadDraft(formId, moduleName)` | Restaura borrador |
| `PWA_SKILLS.initSignaturePad(canvasId)` | Inicializa pizarra de firma |
| `PWA_SKILLS.clearSignature(canvasId)` | Limpia pizarra |
| `esc(valor)` (global) | Escapa un valor para HTML/atributos. Obligatorio en todo `innerHTML` con datos (regla 23) |
| `PWA_SKILLS.hashSHA256(string)` | Hash SHA-256 async (solo proveedor `sheets` legado) |
| `PWA_SKILLS.derivarCredencial(pass, sal?, iter?)` | PBKDF2-SHA256 con sal (210 000 iter.) para la credencial de reingreso offline |
| `PWA_SKILLS.loadRelationalOptions(selectId, originModule, columnLabel, columnValue, sliceConfig)` | Carga opciones REF |
| `PWA_SKILLS.getPeruTime(formatFull)` | Fecha/hora GMT-5 |
| `PWA_SKILLS.exportToExcel(data, fileName)` | Exporta JSON a .xlsx |
| `PWA_SKILLS.addDynamicRow(containerId, fields, valores)` | Agrega fila a tabla hija. `type`: text/date/number/`select` (con `options`)/`textarea`/`display` (solo lectura, para valores calculados). `valores` precarga la fila al editar |
| `PWA_SKILLS.triggerGlobalSync()` | Sincroniza módulo activo |
| `PWA_SKILLS.renderSearchBar(containerId, placeholder)` | Inyecta barra de búsqueda |
| `PWA_SKILLS.renderDynamicFilters(moduleID)` | Inyecta filtros dinámicos del subconfig |
| `PWA_SKILLS.toggleFilterPanel(btn)` | Abre/cierra panel de filtros |
| `PWA_SKILLS.applyFilters()` | Aplica búsqueda + filtros activos |
| `PWA_SKILLS.initEnumWithOther(selectId, inputId)` | Enum con valor libre |
| `PWA_SKILLS.getEnumValue(selectId, inputId)` | Lee valor del enum (incluye 'otro') |
| `PWA_SKILLS.toast(msg, type, duration)` | Notificación (success/error/warning/info) |
| `PWA_SKILLS.enhanceTable(tbodyId)` | Tabla → tarjetas en móvil (<640px) + etiquetas por celda |
| `PWA_SKILLS.renderSkeleton(tbodyId, filas)` | Esqueleto de carga con shimmer (evita CLS) |
| `PWA_SKILLS.showEmptyState(tbodyId, opts)` | Estado vacío con icono, mensaje y acción |
| `PWA_SKILLS.finishLoading(tbodyId)` | Quita el esqueleto y el `aria-busy` |
| `PWA_SKILLS.selectBuscable(select)` / `mejorarSelects(root)` | Buscador en los desplegables. **Se aplica solo** (observador global): siempre en los campos `REF` (sus opciones vienen de otro módulo y crecen) y, en el resto, a partir de 9 opciones —también en filas hijas y filtros—. Se escribe y la lista se filtra sin tildes ni mayúsculas, montado sobre el `<select>` real, que sigue siendo el control del formulario. `buscador: true` en la variable lo fuerza; `data-sin-buscador` lo quita |
| `PWA_SKILLS.marcarObligatorios(vista)` | Asterisco rojo en las etiquetas de campos obligatorios (`data-obligatorios`, `required`); el router la llama al abrir cada Edición |
| `PWA_SKILLS.obtenerUbicacion(opts?)` | Promesa con `{lat, lng, precision, hora}` de la Geolocation API del navegador (`Permissions-Policy: geolocation=(self)` en `vercel.json`). Rechaza con un mensaje ya listo para `toast(msg,'error')`: sin soporte, permiso denegado, GPS apagado o timeout. Ningún módulo la usa todavía — es la capacidad base para el día que uno la necesite (marcar dónde ocurrió algo); no hay tipo de campo `Location` en el subconfig ni columna en Supabase/Sheets: eso se agrega cuando un módulo concreto lo pida |
| `PWA_SKILLS.formatoUbicacion(ubic)` / `enlaceMapa(lat, lng)` | Texto "lat, lng (±N m)" y enlace de Google Maps para mostrar una ubicación capturada |

## El PDF de cada registro: se ve, se archiva solo y se envía

Todo módulo tiene su informe sin configurar nada: `PDF_Templates.js.html`
(`PDF_TEMPLATE`) arma el documento leyendo el **subconfig** —encabezado,
datos, tabla de detalle, imágenes, firmas— y de ahí salen las tres cosas que
hace la app con él: mostrarlo, archivarlo y enviarlo.

**Flujo:** `plantillaBase(modulo)` arma los bloques → `prepararDocumento(modulo, uuid)`
reúne la fila, sus filas hijas y las fotos/firmas ya firmadas →
`renderHTML()` las convierte en HTML → el visor lo pinta y `pdfBlob()` lo
convierte en PDF con html2pdf. No hay plantilla en la base de datos: el
formato es código (`plantillaBase()` y la hoja `CSS` del archivo), y no hay
pestaña de configuración para editarlo.

### 1 · Se ve dentro de la app (nunca en una ventana nueva)

El botón **PDF** del Detalle llama a `PDF_TEMPLATE.exportarRegistro(modulo, uuid, titulo)`,
que abre el **visor**: una capa sobre la app con el documento y cuatro cosas —
volver, **Imprimir** (el diálogo "Guardar como PDF" del sistema), **Descargar**
y **Enviar**. Se cierra con el botón de volver, con Escape, con el botón
físico de atrás del teléfono (`popstate`) y al cambiar de vista.

Antes esto era `window.open()`. En el móvil y dentro de la app instalada eso
es una pestaña a pantalla completa sin barra de direcciones: **el PDF tapaba
la app y no había manera de volver al registro.** Por eso el documento es hoy
una vista más, no una ventana.

**Un informe nunca lleva datos inventados.** Si el registro no está en la copia
local, `prepararDocumento` lo pide al servidor por su UUID; si tampoco así
aparece, **no se genera** y se explica por qué. El registro de ejemplo queda
solo para la vista previa del formato (llamada sin `uuid`). Un documento de
seguridad con aspecto oficial y contenido de muestra es un documento falso, y
por lo mismo el Detalle de un registro que no existe oculta **Editar**, **PDF**
y **Enviar**, y dice el motivo (borrado, de otra empresa o aún sin sincronizar).

Los estilos del documento se inyectan **acotados a `.pt-doc`**
(`_cssDocumento()`): la hoja del PDF declara `body`, `table`, `h1`… y sin
acotar se los aplicaría a la aplicación entera. Al imprimir, un bloque
`@media print` oculta la app y deja solo la hoja.

### 2 · Se archiva solo, y se vuelve a archivar con cada cambio

| Proveedor | Dónde queda el informe |
|---|---|
| `appscript` | Drive: `DATA/<modulo>/00_Informes/<uuid>.pdf` (`SAVE_REPORT`) |
| `supabase` | Storage: `informes/<empresa_id>/<modulo>/<uuid>/informe.pdf` |

El nombre depende **solo del UUID**: actualizar es sustituir ese archivo, no
acumular una copia por edición. En una fiscalización, siete versiones del
mismo informe sin saber cuál rige son peor que ninguna. En Drive el anterior
va a la papelera, así que un archivado equivocado se recupera 30 días.

**Se archiva cuando el registro llega al servidor, nunca antes.** Sin señal no
hay dónde subirlo, así que al sincronizar un registro la cola apunta su UUID
en una lista (`PDF_TEMPLATE.encolarArchivo`, en `localStorage`) y
`procesarPendientes()` los genera de a uno, con tope por pasada —un PDF cuesta
~1 s de CPU; 40 seguidos tras un turno sin cobertura congelarían la app—. La
lista sobrevive al cierre de la app y se reintenta al arrancar. Un fallo de red
**no gasta intentos** (misma regla que la cola: transitorio ≠ rechazado); un
rechazo real se reintenta `MAX_INTENTOS` veces y se descarta para no bloquear
la lista.

Un cambio en el registro —un campo, una fila del detalle, una foto— pasa por el
mismo guardado, así que vuelve a encolar y el informe se regenera.

Se puede desactivar por empresa (`empresas.config.Informe_PDF_Auto = false`) o
por dispositivo (`AppState.Settings.InformePDFAuto = false`); por omisión está
activo.

### 3 · Se borra con el registro

Eliminar el registro principal retira su informe: un documento con sello
oficial no debe sobrevivir al registro del que salió. El orden importa —
**primero el registro, después el documento**: al revés, un borrado que RLS
rechace dejaría un registro vivo sin informe y nada volvería a generarlo.
Lo hace `DataService.delete()` (fachada), y en Apps Script además `DELETE_ROWS`
lo retira en la misma operación.

### 4 · Se envía por WhatsApp

`PDF_TEMPLATE.enviarPorWhatsApp(modulo, uuid, titulo, boton)` — botón
**Enviar** del Detalle y del visor. Dos caminos, en este orden:

1. **El PDF adjunto** (Web Share API): el documento llega al chat y se puede
   reenviar, abrir y guardar.
2. Si el dispositivo no sabe compartir archivos —**el WebView de Android,
   dentro del APK, no implementa Web Share**—, el **enlace** del documento
   archivado. Si aún no estaba archivado (se guardó sin señal), se archiva en
   ese momento.

Si no hay ninguno de los dos se explica por qué, en vez de abrir WhatsApp con
un mensaje sin documento.

**El enlace es para alguien de fuera**, que no tiene cuenta en el Drive ni en
el Supabase de la empresa, así que al pulsar enviar:

- `supabase` → URL **firmada por 7 días**: pasada la semana deja de servir.
- `appscript` → el archivo pasa a "cualquiera con el enlace, solo lectura"
  (`GET_REPORT` con `compartir: true`), y eso queda en `_AUDITORIA` con DNI,
  módulo y UUID.

Solo ocurre al pulsar enviar (nunca al archivar), solo puede hacerlo quien ya
puede ver el registro, y el mensaje lo advierte: *«El enlace abre el documento
a cualquiera que lo reciba: no lo reenvíes fuera de la empresa.»*

### Quién puede archivar y borrar

Quien **edita** el registro, más **su autor** — esto último hace falta porque
hay roles que crean y no editan (un Trabajador en `02_Reportes`): sin ello,
justo el registro que acaba de hacer se quedaría sin informe. Nunca quien solo
puede leerlo. Lo hacen cumplir `storage_puede_archivar()` /
`informe_huerfano()` (generadas en `supabase_03_storage.sql`) y
`puedeArchivarInforme_()` en `Code.gs`.

Por eso el informe vive en un bucket **aparte** de `evidencias` y
`documentos`: ahí sobrescribir y borrar están reservados al Admin, porque
hacerlo es destruir prueba. Un informe no es prueba original, es un documento
derivado que se regenera del registro; si solo el Admin pudiera reescribirlo,
el informe de la inspección que el supervisor acaba de corregir quedaría viejo
para siempre.

### html2pdf va empaquetado, no en un CDN

`html2pdf` (html2canvas + jsPDF, 885 KB) lo baja `npm run vendor` a
`web/vendor/html2pdf.bundle.min.js`. `PDF_TEMPLATE.cargarGenerador()` lo pide
de ahí y solo cae al CDN como respaldo, porque la CSP del proyecto no permite
cdnjs y dentro del APK no hay internet garantizado. Era un fallo real: el
asistente de consentimiento lo cargaba del CDN y en `dist/` quedaba bloqueado,
así que nadie podía firmar su constancia. Ahora los dos usan el mismo cargador.

`npm run test:informes` cubre todo esto sobre el bundle real: que el visor se
abra y se cierre sin ventanas nuevas, que los estilos no se escapen a la app,
que al sincronizar se archive, que editar vuelva a archivar el mismo archivo,
que eliminar el registro borre su informe y que el envío use el adjunto o el
enlace. Las políticas del bucket están en `npm run test:rls` y el camino de
Drive en `npm run test:appscript`.


**Correo por plantilla** (`EMAIL_TEMPLATE_ID`, Skill 10) sí sigue usando Google Docs + `MailApp`, vía `Code.gs` (`sendTemplatedEmail`, disparado desde `SYNC_OFFLINE_QUEUE`) — es la única pieza que se mantuvo puenteada a Apps Script a propósito, porque no tiene reemplazo directo en Supabase.

---

## Captura facial — foto tomada sola (`Face_Capture.js.html`)

Abre la cámara frontal, detecta el rostro con MediaPipe, guía a la persona
(«acércate», «centra tu rostro») y **dispara la foto sola** cuando el rostro
lleva 3 segundos bien encuadrado. Sale recortada 3:4 a 600×800 JPEG. Portado
de `PLATAFORMA_ELEARNING` (`src/hooks/useFaceCapture.ts`, React) a JS nativo.

**Dónde está en uso hoy:** la foto de perfil, en la Edición de `01_Usuarios`
(botón «Tomar foto» junto al avatar; «Cerrar cámara» la apaga, y el icono de
subida sigue permitiendo elegir un archivo). Es el caso para el que se trajo:
que cada persona se tome su foto de perfil al editar sus datos.

**En cualquier otro módulo** basta declararlo en el subconfig — `MOTOR_RENDER`
pinta el panel y la foto viaja por el mismo camino que una imagen normal
(Storage, Detalle, PDF, cola offline). No hay nada más que hacer:

```javascript
"Foto_Verificacion": { type: "Face_Photo", required: true },
"Foto_Perfil":       { type: "Image", captura: "rostro" }
```

Si el módulo declara `Vistas.Edicion.secciones`, hay que nombrar el campo en
una sección (como cualquier otro). Y, como todo campo de archivo nuevo:
`node tools/gen_supabase.js` y aplicar el SQL.

**A mano**, fuera del motor:

```javascript
const cap = FACE_CAPTURE.montar('contenedor', { onCaptura: (dataUrl) => { … } });
FACE_CAPTURE.detenerTodas();   // suelta TODAS las cámaras abiertas
```

| Función | Uso |
|---|---|
| `FACE_CAPTURE.montar(contenedorId, opts)` | Pinta el panel y arranca la cámara. `opts`: `onCaptura(dataUrl, meta)`, `onRepetir`, `etiqueta`, `estabilidadMs`, `valorInicial` |
| `FACE_CAPTURE.detenerTodas()` | Apaga toda cámara abierta. La llaman `showView`, `changeInternalView` y `limpiarFormulario` |
| `FACE_CAPTURE.repetir(id)` / `reiniciar(id)` | Descartar la foto y volver a abrir la cámara |

**Nunca queda la cámara encendida:** se suelta al capturar, al cambiar de
vista, al ocultarse la pestaña y al cerrarla.

**Si no hay detección, el formulario no se bloquea.** Sin red la primera vez,
CDN bloqueado o equipo muy lento → botón «Tomar foto» manual. Cámara denegada,
ocupada o inexistente → botón «Cámara del teléfono» (`input capture="user"`,
la app nativa). El modelo pesa ~6 MB la primera vez; después lo sirve el
service worker (`cdn.jsdelivr.net` está en `CDN_HOSTS` de `web/sw.js`), así
que la captura automática también funciona sin red.

**Umbrales** (los mismos del proyecto de origen, en las constantes del
archivo): 3 s de estabilidad, ancho del rostro entre 15 % y 75 % del cuadro,
centro entre 0,25–0,75 en X y 0,2–0,8 en Y, un fotograma analizado cada 100 ms.


## Alta de usuarios: WhatsApp, no correo

La app **no manda correos de invitación**, a propósito: el personal de campo
casi nunca tiene email real (`api/usuarios.js` les asigna uno técnico
`<dni>@sin-correo.invalid`) y el alta en Auth va con `email_confirm: true`,
que es justo lo que evita el correo de Supabase.

Al crear una cuenta —y al restablecer una contraseña ajena— se abre
`PWA_SKILLS.compartirCredenciales()`: el mensaje de bienvenida ya redactado
(enlace de la app, usuario, contraseña, cómo instalarla, aviso de cambiarla)
con el número del colaborador, botón **Enviar por WhatsApp** y **Copiar**.
Es la última vez que la contraseña existe en claro.

El contacto del proveedor vive en `AppState.Soporte` (`Global_Config.js.html`)
y lo usan el pie del mensaje, el "¿Olvidaste tu contraseña?" del login
(`recuperarAccesoPorSoporte()`) y el botón de soporte del perfil.

**Cambio de la propia contraseña**: "Ver mi perfil" → *Cambiar mi contraseña*.
`DataService.changeOwnPassword(actual, nueva)` verifica la contraseña actual
con un login real (también detecta la cuenta cesada), la cambia —Supabase:
`PUT /auth/v1/user` con la sesión propia, sin pasar por `/api/usuarios`, que
exige Admin; Apps Script: `CHANGE_PASSWORD`, que ya distinguía el caso
propio— y cierra la sesión: la credencial offline vieja se va con ella, pero
la cola de registros pendientes **no** se borra.

**Padrón por empresa (SuperAdmin)**: en el Resumen de `01_Usuarios`, *Agrupar*
separa el directorio por empresa y *Exportar → Padrón por empresa* genera un
`.xlsx` con una hoja por empresa (`PWA_SKILLS.exportToExcelPorHojas`). No
lleva contraseñas: el servidor solo guarda su derivación.

---

## Consentimiento de firma digital (primer ingreso)

`00_Config/Consentimiento.js.html`. La primera vez que alguien entra —y solo
esa vez— se abre un asistente que no se puede cerrar: verificar sus datos
(editables; se guardan en su ficha), selfie con `FACE_CAPTURE` y lectura,
casilla y firma de la autorización de uso de firma digital y datos
biométricos. El texto viene de `PLATAFORMA_ELEARNING` (`src/lib/consentText.ts`),
para que ambas plataformas usen la misma autorización.

Al firmar se arma un PDF A4 (html2pdf desde cdnjs, cargado **solo** en ese
momento) y se archiva como `<DNI>.pdf` dentro de una carpeta por empresa:

| Proveedor | Dónde |
|---|---|
| `appscript` | Drive: `DATA/01_Usuarios/00_Usabilidad/<EMPRESA>/<DNI>.pdf` (`SAVE_CONSENT`) |
| `supabase` | Storage: `documentos/<empresa_id>/consentimientos/<DNI>.pdf` |

Luego se sellan `Consentimiento_Fecha` / `_Folio` / `_Path` en su ficha y no
se vuelve a pedir nunca. La selfie **prueba presencia, no identidad**:
`FACE_CAPTURE` detecta que hay un rostro bien encuadrado, no lo compara con
la foto de perfil.

Para que cada persona pueda sellar su propia ficha, la política `usuarios_upd`
(generada, `supabase_02`) incluye `or id = auth.uid()`; el trigger
`proteger_usuarios` sigue impidiendo que alguien se cambie el rol, el estado,
la empresa, el DNI o el correo a sí mismo. Se verifica con
`npm run test:consentimiento` (33 comprobaciones).

---

## Roles y control de acceso

Cuatro roles. El control real vive en `00_Config/Permisos.js.html` (`PERMISOS`), que lee las matrices de cada subconfig. **Antes existían esas matrices pero nadie las leía**: eran decoración.

| Rol | Quién es | Alcance |
|---|---|---|
| **SuperAdmin** | El proveedor del SaaS (tú) | Todas las empresas. Activa/desactiva módulos por empresa, define planes |
| **Admin** | Representante de la empresa cliente | Toda su empresa. Crea y edita usuarios, aprueba, cierra, elimina |
| **Supervisor** | Responsable de área o equipo | Lo que generó + donde figura como responsable/aprobador. No borra ni gestiona personal |
| **Trabajador** | Personal de campo | Solo lo suyo. Puede reportar (actos, incidentes, PETAR, charlas) porque reportar debe ser fácil |

**Alcance de datos** — declarado por módulo en el subconfig:
`todos` · `responsable` · `propios`

```javascript
AdminRole:       { canCreate: true,  canRead: true, canUpdate: true,  canDelete: true,  alcance: "todos" },
SupervisorRole:  { canCreate: true,  canRead: true, canUpdate: true,  canDelete: false, alcance: "responsable" },
TrabajadorRole:  { canCreate: false, canRead: true, canUpdate: false, canDelete: false, alcance: "propios" }
```

El SuperAdmin **no figura** en las matrices: `PERMISOS.matriz()` le concede todo por jerarquía.

**API de PERMISOS:**

| Función | Uso |
|---|---|
| `PERMISOS.rol()` / `etiqueta()` | Rol normalizado del usuario en sesión |
| `PERMISOS.puede(modulo, 'crear'\|'leer'\|'editar'\|'eliminar')` | Permiso puntual |
| `PERMISOS.alcance(modulo)` | `todos` / `responsable` / `propios` |
| `PERMISOS.filtrarDatos(modulo, filas)` | Aplica el alcance a un conjunto de filas |
| `PERMISOS.moduloVisible(modulo)` | En el plan **y** visible para el rol (lo decide el Admin) **y** con permiso de lectura |
| `PERMISOS.modulos()` | Módulos de trabajo descubiertos en los subconfigs: `{ id, titulo, icono, usadoPor }` (`usadoPor` = quién lo referencia como REF) |
| `PERMISOS.moduloEnPlan(m)` / `visibleParaRol(m, rol)` / `motivoBloqueo(m)` | Piezas de `moduloVisible` y el texto que ve el usuario bloqueado |
| `PERMISOS.aplicarMenu()` / `aplicarVista(modulo)` | Oculta entradas y controles no permitidos |

**Reglas al crear módulos:**
- Todo `Resumen` filtra con `PERMISOS.filtrarDatos()` **antes** de pintar.
- Los botones que dependen de permiso llevan `data-permiso="crear|editar|eliminar"`; `aplicarVista()` los retira solos — también los de filas pintadas después (observa el contenedor). `changeInternalView(..., 'Edicion')` además rechaza abrir el formulario sin permiso.
- Todo acceso a un módulo (menú lateral, tarjeta del panel, barra inferior) lleva `data-modulo="XX_Nombre"`: `aplicarMenu()` lo oculta si el rol no lo ve. Un módulo registrado sin tarjeta ni enlace propio recibe uno genérico automáticamente (`agregarTarjetasModulosNuevos` / `agregarEnlacesDrawerModulosNuevos`).
- **El filtro del navegador es comodidad, no seguridad.** La restricción real la aplica RLS en Postgres.

**Visibilidad por rol (la configura el Admin):** Configuración → Editar → pestaña *Módulos* muestra una matriz módulo × rol generada desde los subconfigs. Se guarda en `empresas.config.Modulos_Visibles` (`{ "07_IPERC": { "trabajador": false } }`; ausente = visible). `00_Admin`, `01_Usuarios` y `04_Configuraciones` no se pueden ocultar. El SuperAdmin ve siempre todo.

---

## Arquitectura SaaS multi-empresa (Supabase)

Cada cliente es una fila en `empresas`. Toda tabla lleva `empresa_id` y RLS impide el acceso cruzado aunque el frontend fallara.

```bash
node tools/gen_supabase.js     # lee los subconfigs y genera el SQL
```

| Archivo | Contenido |
|---|---|
| `supabase_01_schema.sql` | `empresas`, `usuarios`, `plantillas` + una tabla por módulo (y sus hijas) con `empresa_id` |
| `supabase_02_rls.sql` | Políticas por rol. Rol y empresa se leen del JWT (`app_metadata`), sin consulta extra por fila |
| `supabase_03_storage.sql` | Buckets `evidencias`, `documentos`, `publico` con sus políticas |
| `supabase_04_seed.sql` | Empresa de demostración con 30 días de prueba |
| `supabase_05_login.sql` | Función `login_email_de_dni(dni)` — resuelve DNI → email para el login (ver "Autenticación" abajo). Escrito a mano. Límite de 20 consultas por IP cada 10 min (tabla `login_consultas`) para que no se puedan cosechar los emails recorriendo DNIs; no responde para cuentas Cesadas |
| `supabase_06_migracion_incidentes_flash.sql` | Delta: columnas de Flash Report en `incidentes` |
| `supabase_07_produccion.sql` | Generado. `actualizado_en` + triggers que sellan autoría en el servidor (una edición ya no reasigna `creado_por_dni`), sincronización rol/empresa/estado del perfil → JWT (cesar a alguien le corta el acceso), bloqueo de rol `superadmin` para no-SuperAdmin, `empresas.config` + RPC `guardar_config_empresa`, vista `archivos` (inventario de Storage) |
| `supabase_08_rendimiento.sql` | Generado. Índices de paginación, de cada filtro y de trigramas (`pg_trgm`) para el texto; `motor_agregado()` y `motor_cond_sql()`, que cuentan y suman en la base aplicando el RLS de quien llama. Es lo que hace que miles de registros no arrastren la app (ver «Miles de registros») |

| `supabase_09_ota.sql` | Escrito a mano. Bucket `actualizaciones` para la app instalable: lectura pública, **escritura por ninguna política** (solo la `service_role`). Ver «App instalable» |

Ejecutar en el editor SQL de Supabase **en ese orden**. Sobre una base ya desplegada basta con 02, 03, 05, 06, 07, 08 y 09 (idempotentes).

**Qué hace cumplir RLS** (generado desde los subconfigs, no a mano):
- `modulo_habilitado(modulo)` (02) entra en **todas** las políticas de cada tabla de módulo: empresa activa (`empresas.activa`), módulo en el plan (`empresas.modulos`, vacío = todo) y no ocultado por el Admin para ese rol. Una empresa suspendida o un módulo no contratado ya no se lee ni escribe por la API aunque el JWT siga vigente. Code.gs aplica lo mismo (`moduloHabilitado_`).
- SELECT sigue la matriz: `canRead` y `alcance` (`todos` / lo propio + donde figura).
- INSERT/UPDATE/DELETE de cada tabla siguen `canCreate`/`canUpdate`/`canDelete` + `alcance` de la matriz del subconfig. Cambiar la matriz cambia la seguridad real: regenerar y volver a aplicar 02.
- **Tablas hijas**: solo escribe en el detalle quien puede editar el padre. El creador del padre puede completar sus filas durante las primeras 24 h. `empresa_id` de la hija se sella desde el padre (trigger `sellar_hijo`).
- `reemplazar_hijos(p_tabla, p_parent, p_filas)` (en 07): sustituye el detalle en **una transacción** y falla con un error si no hay permiso. `DataProvider._guardar()` la usa; no volver a DELETE + INSERT sueltos. `delete()` borra solo el padre (la FK hace la cascada).
- **Usuarios**: DNI único en toda la plataforma. DNI, email e id **no** se cambian por PATCH (trigger `proteger_usuarios`): van por `/api/usuarios` acción `perfil`, que actualiza Auth y el perfil a la vez. Tampoco se insertan perfiles a mano.
- **PETAR**: nadie aprueba un permiso que solicitó él mismo (`aprobado_por <> creado_por_dni`).

**Pruebas de seguridad** (Postgres real embebido, sin credenciales):
```bash
npm i --no-save @electric-sql/pglite@0.2.17   # una vez
npm run test:rls                               # regenera el SQL y ataca las políticas con 4 roles y 2 empresas
```
Ejecutarlo tras tocar `gen_supabase.js`, una matriz de roles o `supabase_05_login.sql`. Incluye los ataques a `motor_agregado` (lista blanca de tablas, columnas y operadores, y que el conteo respete el alcance del rol). `tools/seed_demo_data.js` siembra datos de ejemplo completos (empresas, usuarios en los 4 roles, registros por módulo) sobre este esquema vía la Admin API + PostgREST.

**Archivos (sustituye a Google Drive):**

Ruta: `<empresa_id>/<modulo>/<uuid>/<campo>_<n>.<ext>` — la empresa va primero para que la política del bucket aísle por carpeta sin consultar tablas.

| Bucket | Visibilidad | Contenido | Límite |
|---|---|---|---|
| `evidencias` | Privado | Fotos, firmas, adjuntos | 10 MB |
| `documentos` | Privado | PDF, Excel, Word, CSV | 25 MB |
| `informes` | Privado | El informe PDF de cada registro (uno por registro, se sustituye) | 10 MB |
| `publico` | Público | Logos y marca | 2 MB |

`DataProvider.subirArchivosDe(modulo, datos)` sube todos los campos de archivo del registro y sustituye su valor por la ruta. Cada subida lleva **nombre único** (`<campo>_<n>_<sello>.<ext>`) y `x-upsert: false`. Borrar **o sobrescribir** evidencia queda reservado a Admin y SuperAdmin: es destruir prueba.

**Lectura de archivos por registro**: `storage_puede_leer(ruta)` (03) solo deja ver un archivo a quien puede ver el registro de `<modulo>/<uuid>` (aplica el RLS de esa tabla). Las fotos y firmas del personal (`01_Usuarios`) las ve quien puede ver a esa persona. La vista `archivos` es solo para Admin/SuperAdmin. Un módulo nuevo entra solo en esa función al regenerar 03.

**`AppState.User` lleva ahora** `EmpresaId`, `EmpresaNombre`, `SupabaseJWT` y `SupabaseRefreshToken`. Sin `EmpresaId` la escritura es rechazada por RLS.

**Autenticación (DNI → Supabase Auth):** la PWA loguea por DNI, pero Supabase Auth identifica usuarios por email. `SupabaseProvider.auth()` resuelve esto en dos pasos: (1) llama a la función `login_email_de_dni(dni)` — `SECURITY DEFINER`, ver `supabase_05_login.sql` — para obtener el email; (2) hace el login real contra `/auth/v1/token?grant_type=password` con ese email y la contraseña **tal cual la escribió el usuario** (no un hash: Supabase la recibe por HTTPS y la hashea con bcrypt server-side). Por eso `handleLogin()` en `App_Routing.js.html` NO pre-hashea la contraseña cuando `DB_PROVIDER === 'supabase'` (sí lo hace para `'sheets'`, que compara contra un hash guardado en la hoja). El JWT emitido se guarda en `AppState.User.SupabaseJWT`; si expira (1h), `SupabaseProvider._fetch()` intenta renovarlo una vez con `SupabaseRefreshToken` antes de fallar.

**Alta de usuarios y contraseñas:** crear un usuario real de Supabase Auth requiere la Admin API (`service_role`). Lo hace `api/usuarios.js` (Vercel) tras verificar que quien llama es Admin activo de su empresa (o SuperAdmin): `DataService.createUser(datos, password)` y `DataService.changePassword(uuid, password)`. Requieren conexión — la contraseña nunca se encola offline. Contraseña: 8+ caracteres con letras y números. Un Admin no cambia la contraseña ni los datos de acceso de **otro** Admin (solo el SuperAdmin). Acción `perfil` (`{ id, email?, dni? }`): la usa la edición de perfil cuando cambia el email. El DNI debe ser único en toda la plataforma (el login resuelve DNI → email con una sola búsqueda; lo garantiza el índice `usuarios_dni_unico`). Sin email, se usa uno técnico `<dni>@sin-correo.invalid`. La edición de perfil (nombre, rol, status, foto, firma) sigue yendo por la cola normal.

**Login offline:** con Supabase no existe usuario demo. Sin red solo puede reentrar el último usuario que inició sesión online en ese dispositivo (se guarda PBKDF2 con sal en `pwa_offline_cred`, nunca un hash rápido). `AppState.User.Token` es aleatorio y no deriva de la contraseña. Cerrar sesión voluntariamente revoca el refresh_token en el servidor (`DataService.logout()`) y borra la cola offline (avisa si hay pendientes); que expire la sesión **no** la borra. El perfil se carga por el **id** de la cuenta autenticada, nunca por DNI.

**Cabeceras (vercel.json):** hay `Content-Security-Policy`. Si se añade un origen nuevo (API, imágenes), hay que agregarlo a la CSP o el navegador lo bloqueará. `img-src`/`connect-src` están limitados a propósito a Supabase y Apps Script: es lo que impide que un XSS se lleve el token. **Una librería nueva no se añade por CDN**: se empaqueta con `npm run vendor` (ver «App instalable»), y `npm run test:ota` falla si queda algo externo en el HTML. El único tercero que sigue permitido es `cdn.jsdelivr.net`, en `script-src`/`connect-src`, para el modelo de detección facial de MediaPipe; `script-src` lleva `'wasm-unsafe-eval'` porque ese modelo es WebAssembly.

**Esa cabecera es la fuente única de la CSP.** `build_web.js` la lee de `vercel.json` y la inyecta además como `<meta http-equiv="Content-Security-Policy">` en `dist/index.html`, porque dentro del WebView de Capacitor no hay cabeceras HTTP y ahí la meta es la única protección. No hay que tocarla en dos sitios: se edita `vercel.json` y se reconstruye. Ver «App instalable».

**Archivos en las vistas:** las columnas guardan la RUTA de Storage. `PWA_SKILLS.renderDriveMedia` y el PDF las firman en lote (`DataService.resolveMedia`, URL de 1 h). El bucket se deduce de la extensión (imagen → `evidencias`, resto → `documentos`). Para separar varios archivos de un campo usar siempre `partirListaMedia(valor)` — nunca `split(',')`: un dataURL contiene una coma. Las galerías (`Image_Collection`) se acumulan al editar.

**Plan y configuración por empresa:** al iniciar sesión llegan `AppState.User.EmpresaModulos` (de `empresas.modulos`, lo decide el SuperAdmin; un módulo ausente se considera no contratado) y `EmpresaConfig` (de `empresas.config`, lo guarda el Admin desde Configuración para toda la empresa).

**Al añadir un módulo nuevo**: ejecutar `node tools/gen_supabase.js` de nuevo y aplicar el SQL. El esquema se deriva de los subconfigs — no se edita a mano.


## Reglas Operacionales (OBLIGATORIAS al crear o editar módulos)

1. **Diseño unificado**: Todos los módulos deben usar los estilos de `Global_Config.js.html` (colores Tailwind del tema, Material Symbols).
2. **Las vistas se generan**: no se escribe HTML por módulo. Resumen, Edición y
   Detalle salen de `Variables` + `Vistas` del subconfig vía `MOTOR_RENDER`.
3. **Un módulo, un archivo**: todo vive en su `subconfig`. Un `Mod_XX_*.html`
   propio es la excepción, no la norma, y hay que justificarla.
4. **Trazabilidad Drive**: El subconfig DEBE incluir `DRIVE_FOLDER_NAME`.
5. **PDF automático**: Todo módulo lo obtiene gratis vía el formato interno (`PDF_Templates.js.html`) leyendo su subconfig — no requiere configuración adicional. Eso incluye el visor dentro de la app, el **archivo automático del informe** en Drive/Storage con cada cambio del registro, su borrado al eliminar el registro y el envío por WhatsApp: no hay nada que declarar ni que invocar por módulo (ver «El PDF de cada registro»). `GOOGLE_DOC_TEMPLATE_ID` es un campo heredado sin uso.
6. **Estructura relacional**: El subconfig DEBE definir `PARENT_TABLE`, `CHILD_TABLE` y `RELATIONAL_KEY`.
7. **Filas dinámicas**: con `CHILD_TABLE` + `Relational_Fields`, el motor arma
   solo el bloque de detalle (alta, alta en bloque, precarga al editar y lista
   en el Detalle). Desde un gancho se usa `MOTOR_RENDER.agregarFila()`.
8. **DNI siempre Text, máximo 8 caracteres**: El campo DNI debe ser tipo `"Text"` (String), nunca Number — para preservar ceros iniciales. Todo input de DNI (login, formularios, filas hijas) lleva `maxlength="8"` + `inputmode="numeric"`; el motor lo aplica solo vía `attrsDNI()` (`Global_Config.js.html`) a los campos cuyo nombre o etiqueta contiene "DNI". En inputs escritos a mano, ponerlo explícitamente.
9. **Campos REF con slice**: Los campos que referencian otros módulos deben ser tipo `"REF"` con `relationalDataOrigin` y opcionalmente `slice`.
10. **Correos por plantilla**: Usar `EMAIL_TEMPLATE_ID` con sintaxis `<<[VARIABLE]>>` en el Google Doc.
11. **Trazabilidad archivos**: Todo campo `Image`/`File` debe tener columnas `_ID` y `_Path` adicionales en el subconfig (tipo `Hidden`).
12. **Vista Detalle premium**: Renderizar miniaturas de imágenes/firmas con `PWA_SKILLS.renderDriveMedia`. Usar grids responsivos.
13. **Header/Footer persistente**: Todo módulo mantiene Header global. Resumen → botón volver al Menú; Edición/Detalle → botón volver al Resumen.
14. **Build obligatorio**: Después de modificar cualquier archivo de `00_Config/` o módulos, ejecutar `node generate_preview.js` antes de probar o desplegar.
15. **Botón sync en Header global**: El botón de sincronización vive en el Header (ya implementado como `#ui-global-sync-btn`), NO dentro del módulo.
16. **Layout de filtros en una fila**: Filtros y búsqueda en una sola fila responsiva. No bloques verticales grandes.
17. **Barra filtrado inline colapsable**: Vista Resumen usa `PWA_SKILLS.renderSearchBar` + `PWA_SKILLS.renderDynamicFilters`. Panel colapsable, no FAB ni flotante.
18. *(reservada)*
19. **Filtros dinámicos por subconfig**: Los filtros se generan de `isFilter: true` en el subconfig. No hardcodear filtros en HTML.
20. **Densidad compacta en tablas**: Usar `px-3 py-2` en celdas para maximizar registros visibles en móvil.
21. **Jerarquía de acciones en Detalle**: Acciones (Editar, PDF) en stack vertical alineado a la derecha. Botones pequeños (`h-7`, `text-[9px]`), con `whitespace-nowrap`.
22. **Sistema de diseño "Data-Dense Dashboard" + identidad «Industrial seguro»** (azul marino `#162138` + amarillo de seguridad `#ffd53f`, tipografía Archivo): referencia obligatoria en `design-system/motor-pwa/MASTER.md` y en la skill `.claude/skills/motor-pwa-design`. Reglas no negociables:
    - **Amarillo = acción**: todo `button.bg-primary` se pinta solo en amarillo con texto marino (regla global en `Index.html`). El amarillo **nunca** es color de texto (1.4:1) ni indica advertencia (para eso, `--st-warn-*`).
    - **Nunca hex crudos** en módulos — usar los tokens `--ds-*`, `--st-*` (estados) o las utilidades Tailwind del tema. Cada color debe verse bien en claro Y en oscuro.
    - **Contraste mínimo 4.5:1** para texto normal, 3:1 para texto ≥18px. Verificado: texto 16.0:1 (claro) y 14.6:1 (oscuro); secundario 6.7:1 y 8.3:1; marino sobre amarillo 11.3:1.
    - **Toda tabla de Resumen** llama a `PWA_SKILLS.enhanceTable(tbodyId)` tras pintar filas (el router ya lo hace automáticamente en la vista Resumen).
    - **Toda carga >300ms** muestra `renderSkeleton()`; todo resultado vacío muestra `showEmptyState()` con acción de salida.
    - **Botones solo-icono** requieren `aria-label`; los iconos decorativos llevan `aria-hidden="true"`.
    - **Área táctil ≥44px** en móvil (ya cubierta globalmente por `@media (pointer: coarse)` en Index.html).
    - **Texto nunca bajo 12px** dentro de tarjetas móviles; campos de formulario a 16px para evitar el auto-zoom de iOS.
23. **Escapar todo dato pintado como HTML (XSS)**: cualquier valor de un registro que entre en `innerHTML` o en una plantilla `` `...` `` va con la función global `esc()` (`Global_Config.js.html`): `${esc(r.Area || '—')}`, `'<p>' + esc(a.Nombre) + '</p>'`. Los helpers que devuelven HTML (`*Badge`, `*Campo`) escapan **por dentro**. **Nunca** interpolar datos dentro de un `onclick`: `esc()` no protege ahí (el navegador decodifica `&#39;` antes de ejecutar). Usar `data-uuid="${esc(r.UUID)}" onclick="changeInternalView('XX','Detalle',this.dataset.uuid)"`. Valores en selectores CSS → `CSS.escape()`. Texto plano → `textContent`. Los tokens de sesión viven en `localStorage`: un solo campo sin escapar permite robar la sesión del Admin.
24. **Aprovechar al máximo el espacio**: si dos campos cortos caben en la misma fila, van en la misma fila (también en móvil): fecha + hora, área + lugar, inicio + fin. Solo ocupan fila completa descripciones, textareas, selectores con ayuda larga, galerías y firmas. En las tarjetas móviles ninguna fila queda casi vacía: identificador y fecha en una línea, el dato principal a ancho completo, los datos secundarios agrupados y los distintivos juntos al final. Detalle y mecanismo en `design-system/motor-pwa/MASTER.md` §4.
25. **Nada de contar sobre las filas cargadas**: un Resumen trae una página, así
    que todo indicador, total o distintivo que deba reflejar el conjunto se pide
    con `DataService.count`/`aggregate` (o un KPI declarativo con `cond`), nunca
    con `ctx.filas.filter(...).length`. Vale también fuera de los módulos: el
    «Resumen de trabajo» del menú lateral cuenta sus pendientes y vencidos con
    `AGG_BATCH` por módulo (`drawerCondicionesModulo` deduce la condición del
    subconfig) y al pulsarlo manda esa misma condición a `MOTOR_RENDER.recargar`,
    en vez de descargar las tablas y ocultar filas. Lo mismo para filtrar: va por
    `MOTOR_RENDER.recargar()`, no ocultando `<tr>`. Contar en pantalla esconde
    lo antiguo —justo lo que hay que vigilar— y no da ningún error.
26. **Campos obligatorios con asterisco**: todo valor obligatorio lleva un `*` rojo en su etiqueta. La raíz de cada Edición declara los ids en `data-obligatorios="id1 id2 …"` y `PWA_SKILLS.marcarObligatorios()` los marca sola al abrir el formulario. La lista debe coincidir con la validación de guardado y con `required: true` del subconfig.

27. **Las listas se escriben, no se recorren**: un desplegable filtra sus
    opciones conforme se teclea (sin distinguir mayúsculas ni tildes). **Todo
    campo `REF` lo lleva siempre**, por pocas opciones que tenga hoy: una lista
    de personal empieza con ocho nombres y acaba con doscientos. Los demás
    (`Enum`, filas hijas, panel de filtros) lo reciben a partir de 9 opciones.
    Lo monta solo el observador de `Global_Skills.js.html` («SKILL 28») sobre el
    `<select>` real, también en las vistas escritas a mano, así que **no hay que
    invocarlo ni duplicarlo por módulo**. `buscador: true` en una variable lo
    fuerza en un `Enum` corto; `data-sin-buscador` lo quita en un campo.

28. **Cada casilla acepta solo lo suyo**: el control corresponde al dato y
    decide el teclado del móvil. Una cantidad (días, horas, personas, notas,
    importes) se declara `control: "number"` con `min`/`max`/`step` —el
    mínimo por defecto es 0—; correo `email`, teléfono `tel`, DNI de 6 a 8
    caracteres alfanuméricos, y `maxLength` en los textos con tope. Las
    mismas claves valen en `Relational_Fields`. El motor deduce el control
    por el nombre del campo, pero **eso es una red de seguridad, no la
    regla**: lo que no se declara acaba aceptando «dsdsds» donde iba un
    número. `MOTOR_RENDER.guardar()` revisa el formulario entero (incluidas
    las filas hijas) con `checkValidity()`, enfoca la primera casilla mal
    puesta y no encola nada: un dato roto encolado sin conexión se descubre
    horas después, cuando ya nadie puede corregirlo.

---

## Registro de módulos en Index.html

Al agregar un módulo nuevo basta **una línea** en `00_Config/Index.html`, dentro
de `#module-registry`:

```html
<?!= include('XX_NuevoModulo/subconfig_XX_NuevoModulo.js'); ?>
```

No hay que tocar el menú lateral, el panel ni el router: `PERMISOS.modulos()`
descubre el módulo en el subconfig y `agregarTarjetasModulosNuevos()` /
`agregarEnlacesDrawerModulosNuevos()` le dan tarjeta y enlace con su `Titulo` y
su `Card_Icon`. Solo se escribe un acceso a mano para colocarlo en un sitio
concreto, y entonces lleva `data-modulo="XX_NuevoModulo"` para que
`PERMISOS.aplicarMenu()` pueda ocultarlo.

---

## Variables globales de AppState

```javascript
AppState.User.DNI        // DNI del usuario logueado
AppState.User.Nombre     // Nombre completo
AppState.User.Rol        // Admin | Supervisor | Trabajador
AppState.User.Token      // Hash SHA-256 de password (token de sesión)
AppState.User.Status     // Activo | Cesado
AppState.activeModule    // Módulo activo actualmente (ej: '03_Inspecciones')
AppState.VERSION         // Versión de la app
AppState.DB_PROVIDER     // 'supabase' (default) o 'sheets' (legado)
```

---

## Navegación entre vistas

```javascript
showView('Menu')               // Ir al menú principal
showView('03_Inspecciones')    // Abrir un módulo
changeInternalView('03_Inspecciones', 'Resumen')        // Vista lista
changeInternalView('03_Inspecciones', 'Edicion', uuid)  // Formulario edición
changeInternalView('03_Inspecciones', 'Detalle', uuid)  // Vista detalle
PWA_SKILLS.toast('Guardado', 'success')  // Notificación
```

---

## Módulos existentes

| Carpeta | Variable Subconfig | Drive Folder | Tiene Child |
|---|---|---|---|
| `00_Admin/` | `SUBCONFIG_00_ADMIN` | — | No |
| `01_Usuarios/` | `SUBCONFIG_01_USUARIOS` | `01_Usuarios_DB` | No |
| `02_Reportes/` | `SUBCONFIG_02_REPORTES` | — | No |
| `03_Inspecciones/` | `SUBCONFIG_03_INSPECCIONES` | `03_Inspecciones_Docs` | Sí (CHILD) |
| `00_Config/001_Configuraciones/` | `SUBCONFIG_04_CONFIGURACIONES` | — | No |
| `04_Actos_Condiciones/` | `SUBCONFIG_04_ACTOS_CONDICIONES` | `04_Actos_Condiciones_DB` | No |
| `05_Incidentes/` | `SUBCONFIG_05_INCIDENTES` | `05_Incidentes_DB` | Sí (`ACCIONES`) |
| `06_Capacitaciones/` | `SUBCONFIG_06_CAPACITACIONES` | `06_Capacitaciones_DB` | Sí (`ASISTENTES`) |
| `07_IPERC/` | `SUBCONFIG_07_IPERC` | `07_IPERC_DB` | Sí (`PELIGROS`) |
| `08_PETAR/` | `SUBCONFIG_08_PETAR` | `08_PETAR_DB` | Sí (`VERIFICACIONES`) |
| `09_EPP/` | `SUBCONFIG_09_EPP` | `09_EPP_DB` | Sí (`ITEMS`) |
| `10_Charlas/` | `SUBCONFIG_10_CHARLAS` | `10_Charlas_DB` | Sí (`ASISTENTES`) |

Los módulos 02 a 10 son solo su subconfig: las vistas las genera `MOTOR_RENDER`.
Ocho de ellos añaden `MOTOR_HOOKS` para sus indicadores y cálculos propios.
