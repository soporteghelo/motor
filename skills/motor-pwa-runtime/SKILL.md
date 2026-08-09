---
name: motor-pwa-runtime
description: Implementa y mantiene comportamientos reutilizables del frontend de MOTOR PWA, incluidos archivos multimedia, firmas, borradores sin conexión, campos dinámicos, sincronización, filtros, exportaciones, tablas responsivas, estados de carga y notificaciones. Úsala al modificar `PWA_SKILLS`, un módulo que invoca `PWA_SKILLS` o comportamientos compartidos de `00_Config`.
---

# Motor PWA: funciones compartidas

Usa la implementación canónica ubicada en `../../00_Config/Global_Skills.js.html`. No dupliques su código en archivos de módulos.

## Flujo de trabajo

1. Identifica la API existente de `PWA_SKILLS` que corresponde al requerimiento; consulta la [referencia de API](references/api.md).
2. Modifica la implementación canónica o el módulo que la invoca, preservando el comportamiento específico del módulo.
3. Mantén compatibles el ruteador, permisos y flujo sin conexión.
4. Ejecuta `node generate_preview.js` después de editar `00_Config` o cualquier módulo.
5. Valida la sintaxis y el bundle generado afectado. No edites manualmente `LOCAL_PREVIEW.html` ni `PROD_INDEX.html`.

## Convenciones

- Usa `PWA_SKILLS.renderSearchBar()` y `renderDynamicFilters()` en vistas Resumen; los filtros provienen de `isFilter` en el subconfig.
- Usa `enhanceTable()` después de renderizar filas. Agrega excepciones de tarjetas por módulo solo cuando las tarjetas móviles genéricas oculten jerarquía importante.
- Mantén legibles los campos normales de formularios en móvil; los controles breves de búsqueda y filtros pueden usar un tamaño compacto intencional cuando el diseño lo requiera.
- Usa `renderSkeleton()`, `showEmptyState()` y `finishLoading()` para listas asíncronas.
- Conserva etiquetas accesibles, foco visible y los tokens claro/oscuro de la aplicación.
