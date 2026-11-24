# El informe PDF de cada registro

Fuente canónica: `00_Config/PDF_Templates.js.html` (`PDF_TEMPLATE`).
Backend de Drive: `00_Config/Code.gs` (`SAVE_REPORT`, `DELETE_REPORT`, `GET_REPORT`).
Políticas de Storage: `tools/supabase_03_storage.sql` (generado).

**Un módulo no declara nada para tener todo esto.** El documento se arma
leyendo su `subconfig`, igual que las tres vistas. Si al crear un módulo
alguien pregunta "¿y el PDF?", la respuesta es que ya está.

## Las cuatro cosas que pasan con el informe

| Qué | Quién lo hace | Cuándo |
|---|---|---|
| Se ve dentro de la app | `exportarRegistro(modulo, uuid, titulo)` → visor | botón **PDF** del Detalle |
| Se archiva en el servidor | `encolarArchivo()` + `procesarPendientes()` | al sincronizar el registro, y en cada cambio |
| Se borra | `DataService.delete()` → `borrarArchivo()` | al eliminar el registro principal |
| Se envía | `enviarPorWhatsApp(modulo, uuid, titulo, boton)` | botón **Enviar** del Detalle y del visor |

Dónde queda archivado:

| Proveedor | Ruta |
|---|---|
| `appscript` | Drive: `DATA/<modulo>/00_Informes/<uuid>.pdf` |
| `supabase` | Storage: `informes/<empresa_id>/<modulo>/<uuid>/informe.pdf` |

## API

| Función | Uso |
|---|---|
| `PDF_TEMPLATE.exportarRegistro(modulo, uuid, titulo)` | Abre el visor. Sin `uuid`, vista previa del formato con datos de ejemplo |
| `PDF_TEMPLATE.abrirVisor(doc)` / `cerrarVisor()` / `imprimirVisor()` | El visor por partes (lo normal es no llamarlas) |
| `PDF_TEMPLATE.prepararDocumento(modulo, uuid, titulo)` | `{ registro, hijos, plantilla, titulo, falta }` — fila + filas hijas + fotos firmadas |
| `PDF_TEMPLATE.pdfBlob(doc)` | El documento como Blob PDF (A4) |
| `PDF_TEMPLATE.descargar(modulo, uuid, boton)` | Lo baja al dispositivo |
| `PDF_TEMPLATE.archivar(modulo, uuid)` | Genera y sube. Devuelve `{status, transitorio}` |
| `PDF_TEMPLATE.encolarArchivo(modulo, uuids)` | Apunta registros para archivar (lo llama la cola) |
| `PDF_TEMPLATE.procesarPendientes({tope})` | Archiva los pendientes de a uno |
| `PDF_TEMPLATE.borrarArchivo(modulo, uuid)` | Retira el informe archivado |
| `PDF_TEMPLATE.enviarPorWhatsApp(...)` | Adjunto si se puede, enlace si no |
| `PDF_TEMPLATE.cargarGenerador()` | html2pdf desde `/vendor`, con el CDN solo como respaldo |
| `DataService.saveReport({blob, modulo, uuid})` / `deleteReport` / `reportInfo` | La capa de datos, igual en los dos proveedores |

## Lo que no se debe cambiar sin entender por qué

- **El visor no es una ventana nueva.** Era `window.open()`, y en el móvil y
  dentro del APK eso es una pestaña a pantalla completa sin barra de
  direcciones: tapaba la app y no había forma de volver al registro. El
  documento es una capa de la app, que se cierra con el botón de volver, con
  Escape, con el botón físico de atrás y al cambiar de vista.
- **Los estilos del documento van acotados a `.pt-doc`** (`_cssDocumento()`).
  La hoja del PDF declara `body`, `table`, `h1`…: sin acotar se los aplica a
  la aplicación entera. Si añades reglas, añádelas a `CSS` (plana, una regla
  por selector) y el acotado sale solo.
- **El informe se archiva cuando el registro ya está en el servidor**, nunca
  al guardar: sin señal no hay dónde subirlo. Por eso hay una lista de
  pendientes en `localStorage` que sobrevive al cierre de la app.
- **Un fallo de red no gasta intentos** (misma regla que la cola offline:
  transitorio ≠ rechazado). Confundirlos descarta informes de quien trabaja
  sin cobertura.
- **Hay tope por pasada** al generar: un PDF cuesta ~1 s de CPU, y 40 seguidos
  tras un turno sin señal congelan la app.
- **El nombre del archivo depende solo del UUID.** Actualizar es sustituirlo;
  si se le pone fecha o un contador se acumulan copias y en una fiscalización
  nadie sabe cuál rige.
- **Primero se borra el registro y después su informe.** Al revés, un borrado
  que RLS rechace deja un registro vivo sin informe y nada vuelve a generarlo.
- **Nunca un informe con datos de ejemplo** cuando se pidió un registro
  concreto: un documento de seguridad con aspecto oficial y contenido de
  muestra es un documento falso.
- **El enlace de WhatsApp expone el documento a quien lo reciba.** Solo se
  genera al pulsar enviar, solo lo obtiene quien puede ver el registro, en
  Supabase caduca a los 7 días, en Drive queda en `_AUDITORIA` y el mensaje lo
  advierte. No lo conviertas en parte del archivado.
- **html2pdf va empaquetado** (`npm run vendor` → `web/vendor/`). La CSP del
  proyecto no permite cdnjs: si lo cargas del CDN, en `dist/` y en el APK
  queda bloqueado y no se genera ningún PDF.

## Al tocar esto

```bash
npm run test:informes      # visor, archivo, borrado y envío (bundle real en jsdom)
npm run test:rls           # políticas del bucket informes
npm run test:appscript     # el camino de Drive (SAVE_REPORT / GET_REPORT / DELETE_ROWS)
```

Un **módulo nuevo** entra solo en las políticas y en las funciones del bucket
al ejecutar `node tools/gen_supabase.js` y aplicar `supabase_03_storage.sql`.
