# API de PWA_SKILLS

Fuente canónica: `00_Config/Global_Skills.js.html`.

| Capacidad | API |
|---|---|
| Imágenes y multimedia | `compressImage`, `renderDriveMedia` |
| Borradores locales | `saveDraft`, `loadDraft` |
| Firmas | `initSignaturePad`, `clearSignature` |
| Seguridad y hora | `hashSHA256`, `getPeruTime` |
| Campos relacionales | `loadRelationalOptions`, `addDynamicRow` |
| Sincronización | `triggerGlobalSync` |
| Búsqueda y filtros | `renderSearchBar`, `initEnumWithOther`, `getEnumValue`, `toggleFilterPanel`, `renderDynamicFilters`, `applyFilters`, `clearFilters` |
| Informe PDF del registro | `PDF_TEMPLATE.exportarRegistro`, `archivar`, `borrarArchivo`, `enviarPorWhatsApp` (+ `DataService.saveReport` / `deleteReport` / `reportInfo`) — ver [informes.md](informes.md) |
| Avisos | `toast` |
| Tablas y resultados | `initSortableTable`, `updateResultCount`, `enhanceTable` |
| Exportaciones | `exportToExcel`, `exportVisibleToCSV`, `exportFilteredToExcel` |
| Carga y estados vacíos | `renderSkeleton`, `showEmptyState`, `finishLoading` |
| Listas largas | `selectBuscable`, `mejorarSelects` (buscador automático: todo `<select>` con `data-ref`/`data-buscador` —los campos REF— y cualquier otro de más de 8 opciones; `data-sin-buscador` lo desactiva) |
| Formularios | `marcarObligatorios` (asterisco rojo en obligatorios; ids en `data-obligatorios` de la raíz de la Edición) |
| Geolocalización | `obtenerUbicacion(opts?)` → promesa `{lat, lng, precision, hora}` (Geolocation API; rechaza con mensaje listo para `toast`); `formatoUbicacion`, `enlaceMapa` para mostrarla. Capacidad base, sin tipo de campo `Location` ni columna en el esquema todavía — úsala desde un botón o un `MOTOR_HOOKS` propio del módulo que la necesite |

Los auxiliares internos prefijados con `_` no son APIs de módulos. Mantén los módulos sobre métodos públicos, salvo al modificar el motor compartido.
