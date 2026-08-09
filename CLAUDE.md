# MOTOR PWA ZERO-TOUCH — Guía para Claude

## Qué es este proyecto

PWA Enterprise sobre Google Apps Script. Frontend SPA en un solo `Index.html` con módulos HTML inyectados. Backend en `00_Config/Code.gs` (Zero-Touch Engine). No usa frameworks — solo Tailwind CSS + Material Symbols + JS nativo.

---

## Arquitectura general

```
MOTOR/
├── 00_Config/              ← NÚCLEO del motor
│   ├── Code.gs             ← Backend ÚNICO (Zero-Touch Engine, Drive autodiscovery)
│   ├── Index.html          ← Shell SPA principal — NO tocar estructura base
│   ├── Global_Config.js.html   ← AppState global, colores, sesión
│   ├── Global_Skills.js.html   ← PWA_SKILLS API (todas las funciones reutilizables)
│   ├── Offline_Engine.js.html  ← IndexedDB + cola offline
│   ├── App_Routing.js.html     ← Router SPA + login + menu dashboard
│   ├── 000_Docs/           ← Documentación interna
│   └── 001_Configuraciones/    ← Módulo de config del sistema
├── 00_Admin/               ← Módulo SuperAdmin
├── 01_Usuarios/            ← Módulo usuarios + auth
├── 02_Reportes/            ← Módulo reportes
├── 03_Inspecciones/        ← Módulo inspecciones (ejemplo con CHILD_TABLE)
├── generate_preview.js     ← Build: genera LOCAL_PREVIEW.html y PROD_INDEX.html
├── server.js               ← Servidor local de preview
└── PROD_INDEX.html         ← HTML final bundleado para pegar en GAS
```

**Cada módulo tiene exactamente:**
- `subconfig_XX_Nombre.js.html` — esquema de datos y permisos
- `Mod_XX_Nombre_Resumen.html` — vista lista/tabla
- `Mod_XX_Nombre_Edicion.html` — formulario crear/editar
- `Mod_XX_Nombre_Detalle.html` — vista de detalle del registro

---

## Flujo de build

```bash
node generate_preview.js   # Lee Index.html, resuelve todos los <?!= include() ?>, genera PROD_INDEX.html
```

`generate_preview.js` busca archivos en este orden:
1. `MOTOR/<filename>` (ruta absoluta desde raíz)
2. Fallback: `MOTOR/00_Config/<filename>`

**Después de cualquier cambio** en `00_Config/` o módulos, ejecutar el build antes de probar o desplegar.

---

## Backend (Code.gs) — Zero-Touch Engine

**Acciones disponibles:**
| Action | Descripción |
|---|---|
| `READ_DB` | Lee todos los registros (paginado, `page` + `pageSize`) |
| `READ_DELTA` | Lee solo registros nuevos desde `lastSyncDate` |
| `SYNC_OFFLINE_QUEUE` | Inserta lote desde cola offline (requiere `subconfig`) |
| `DELETE_ROWS` | Elimina en cascada padre + hijos por UUID |
| `SYSTEM_HEALTH_CHECK` | Valida paridad entre subconfig y columnas del Sheets |
| `LOGIN_AUTH` | Autenticación con hash SHA-256 |

**Autodiscovery**: El backend localiza cada módulo buscando una carpeta por nombre en Drive (`ROOT_APP_FOLDER_ID`). El Spreadsheet de cada módulo vive dentro de esa carpeta.

**Seguridad**: `authSessionGuard()` bloquea usuarios con Status `CESADO` o `INACTIVO` en cada request (excepto `LOGIN_AUTH`).

---

## Estructura de Subconfig

Cada módulo define su esquema en `subconfig_XX.js.html`. Ejemplo mínimo:

```javascript
var SUBCONFIG_XX_NOMBRE = {
  Config_Modular: {
    NombreInterno: "XX_Nombre",
    DRIVE_FOLDER_NAME: "XX_Nombre_DB",      // Nombre de carpeta en Drive
    GOOGLE_DOC_TEMPLATE_ID: "",             // ID Google Docs para PDF (vacío = omitir)
    EMAIL_TEMPLATE_ID: "",                  // ID Google Docs para email
    PARENT_TABLE: "MAIN",                   // Nombre pestaña principal en Sheets
    CHILD_TABLE: "",                        // Pestaña hija (vacío si no hay)
    RELATIONAL_KEY: "UUID",                 // Llave relacional padre-hijo
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
| `Image` | Captura/upload de imagen única, comprimida client-side |
| `Image_Collection` | Múltiples imágenes |
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
| `PWA_SKILLS.renderDriveMedia(val, id, containerId)` | Renderiza galería de imágenes Drive |
| `PWA_SKILLS.saveDraft(formId, moduleName)` | Guarda borrador en LocalStorage |
| `PWA_SKILLS.loadDraft(formId, moduleName)` | Restaura borrador |
| `PWA_SKILLS.initSignaturePad(canvasId)` | Inicializa pizarra de firma |
| `PWA_SKILLS.clearSignature(canvasId)` | Limpia pizarra |
| `PWA_SKILLS.hashSHA256(string)` | Hash SHA-256 async (para passwords) |
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

## Plantillas PDF — el admin las edita en Google Docs

Cada módulo se vincula a un **Google Doc** que hace de plantilla. El administrador lo abre en Docs, le da el formato de la empresa (logo, colores, tablas) y escribe marcadores `<<[Campo]>>` donde quiera que salgan los datos. Se gestiona desde **Configuración → pestaña PDF**.

**Flujo:** Crear plantilla base (el servidor genera un Doc ya armado con todos los campos) → el admin lo edita en Google Docs → al exportar, el backend copia la plantilla, sustituye marcadores preservando el formato y devuelve el PDF.

| Acción de Code.gs | Qué hace |
|---|---|
| `CREATE_DOC_TEMPLATE` | Crea el Doc base desde el esquema del módulo y lo deja en su carpeta de Drive |
| `GENERATE_PDF` | Copia la plantilla, rellena, exporta a PDF y lo guarda en la carpeta del módulo |
| `SAVE_TEMPLATE` / `READ_TEMPLATE` | Vínculo módulo ↔ Doc, en la pestaña `_PLANTILLA_PDF` (fila `DOC_ID`) |

**Marcadores admitidos en el Doc:**
- `<<[Campo]>>` — cualquier campo del registro
- `<<[Campo]>>` en campos `Image`/`Signature` — se inserta la **imagen real** desde Drive (usa la columna `Campo_ID`)
- `<<[__FECHA__]>>` — fecha de emisión
- **Tabla de detalle:** una tabla cuya **última fila** contenga marcadores; esa fila se clona por cada registro hijo

**Reglas al tocar esto:**
- `replaceText()` de Apps Script interpreta expresiones regulares: los corchetes de `<<[...]>>` se escapan con `escaparBusqueda()`. Sin eso no encuentra nada.
- La plantilla original **nunca se modifica**: siempre se trabaja sobre una copia que se borra al terminar.
- Si un módulo no tiene plantilla, se imprime con un **formato interno de respaldo** (`plantillaBase` + `renderHTML` en `PDF_Templates.js.html`). Ese formato no es editable; para personalizarlo hay que crear la plantilla de Docs.
- La lista de marcadores sale del **subconfig**: si añades un campo al formulario aparece solo en la chuleta.

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
| `PERMISOS.moduloVisible(modulo)` | Activo en el plan **y** con permiso de lectura |
| `PERMISOS.aplicarMenu()` / `aplicarVista(modulo)` | Oculta entradas y controles no permitidos |

**Reglas al crear módulos:**
- Todo `Resumen` filtra con `PERMISOS.filtrarDatos()` **antes** de pintar.
- Los botones que dependen de permiso llevan `data-permiso="crear|editar|eliminar"`; `aplicarVista()` los retira solos.
- **El filtro del navegador es comodidad, no seguridad.** La restricción real la aplica RLS en Postgres.

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

Ejecutar en el editor SQL de Supabase **en ese orden**.

**Archivos (sustituye a Google Drive):**

Ruta: `<empresa_id>/<modulo>/<uuid>/<campo>_<n>.<ext>` — la empresa va primero para que la política del bucket aísle por carpeta sin consultar tablas.

| Bucket | Visibilidad | Contenido | Límite |
|---|---|---|---|
| `evidencias` | Privado | Fotos, firmas, adjuntos | 10 MB |
| `documentos` | Privado | PDF, Excel, Word, CSV | 25 MB |
| `publico` | Público | Logos y marca | 2 MB |

`DataProvider.subirArchivosDe(modulo, datos)` sube todos los campos de archivo del registro y sustituye su valor por la ruta. Borrar evidencia queda reservado a Admin y SuperAdmin: es destruir prueba.

**`AppState.User` lleva ahora** `EmpresaId`, `EmpresaNombre` y `SupabaseJWT`. Sin `EmpresaId` la escritura es rechazada por RLS.

**Al añadir un módulo nuevo**: ejecutar `node tools/gen_supabase.js` de nuevo y aplicar el SQL. El esquema se deriva de los subconfigs — no se edita a mano.


## Reglas Operacionales (OBLIGATORIAS al crear o editar módulos)

1. **Diseño unificado**: Todos los módulos deben usar los estilos de `Global_Config.js.html` (colores Tailwind del tema, Material Symbols).
2. **Vistas obligatorias**: Todo módulo DEBE tener Resumen, Edicion y Detalle — 3 archivos separados.
3. **Segregación**: Cada vista en su propio archivo `.html`.
4. **Trazabilidad Drive**: El subconfig DEBE incluir `DRIVE_FOLDER_NAME`.
5. **Automatización PDF**: El subconfig DEBE incluir `GOOGLE_DOC_TEMPLATE_ID` (vacío = omitir generación).
6. **Estructura relacional**: El subconfig DEBE definir `PARENT_TABLE`, `CHILD_TABLE` y `RELATIONAL_KEY`.
7. **Filas dinámicas**: Si hay `CHILD_TABLE`, el formulario de Edición DEBE incluir el componente de filas dinámicas con `PWA_SKILLS.addDynamicRow`.
8. **DNI siempre Text**: El campo DNI debe ser tipo `"Text"` (String), nunca Number — para preservar ceros iniciales.
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
22. **Sistema de diseño "Data-Dense Dashboard"**: Referencia obligatoria en `design-system/motor-pwa/MASTER.md` (generado con la skill `ui-ux-pro-max`). Reglas no negociables:
    - **Nunca hex crudos** en módulos — usar los tokens `--ds-*` o las utilidades Tailwind del tema. Cada color debe verse bien en claro Y en oscuro.
    - **Contraste mínimo 4.5:1** para texto normal, 3:1 para texto ≥18px. Verificado: la app está en 4.88:1 (claro) y 7.57:1 (oscuro).
    - **Toda tabla de Resumen** llama a `PWA_SKILLS.enhanceTable(tbodyId)` tras pintar filas (el router ya lo hace automáticamente en la vista Resumen).
    - **Toda carga >300ms** muestra `renderSkeleton()`; todo resultado vacío muestra `showEmptyState()` con acción de salida.
    - **Botones solo-icono** requieren `aria-label`; los iconos decorativos llevan `aria-hidden="true"`.
    - **Área táctil ≥44px** en móvil (ya cubierta globalmente por `@media (pointer: coarse)` en Index.html).
    - **Texto nunca bajo 12px** dentro de tarjetas móviles; campos de formulario a 16px para evitar el auto-zoom de iOS.

---

## Registro de módulos en Index.html

Al agregar un nuevo módulo, registrarlo en `00_Config/Index.html` dentro de `#module-registry`:

```html
<!-- Módulo XX_NuevoModulo -->
<?!= include('XX_NuevoModulo/subconfig_XX_NuevoModulo.js'); ?>
<?!= include('XX_NuevoModulo/Mod_XX_NuevoModulo_Resumen'); ?>
<?!= include('XX_NuevoModulo/Mod_XX_NuevoModulo_Edicion'); ?>
<?!= include('XX_NuevoModulo/Mod_XX_NuevoModulo_Detalle'); ?>
```

Y agregar su link en el drawer de navegación y en el `map` de `updateDrawerActiveLink()` en `App_Routing.js.html`.

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
AppState.DB_PROVIDER     // 'sheets' o 'supabase'
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
