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
| Avisos | `toast` |
| Tablas y resultados | `initSortableTable`, `updateResultCount`, `enhanceTable` |
| Exportaciones | `exportToExcel`, `exportVisibleToCSV`, `exportFilteredToExcel` |
| Carga y estados vacíos | `renderSkeleton`, `showEmptyState`, `finishLoading` |

Los auxiliares internos prefijados con `_` no son APIs de módulos. Mantén los módulos sobre métodos públicos, salvo al modificar el motor compartido.
