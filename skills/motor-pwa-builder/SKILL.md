---
name: motor-pwa-builder
description: Construye o amplía módulos de MOTOR PWA mediante la arquitectura SPA de Google Apps Script del repositorio, la estructura modular, el esquema subconfig, permisos, flujo sin conexión y proceso de compilación. Úsala al crear un módulo o modificar su modelo de datos, vistas, ruteo o registro.
---

# Motor PWA: constructor de módulos

Lee `../../CLAUDE.md` y los archivos relevantes de `../../00_Config/000_Docs/` antes de crear o reestructurar un módulo.

## Flujo para módulos

1. Define el flujo de datos entre la interfaz y el servidor antes de programar. Usa un diagrama Mermaid al diseñar un módulo o relación de datos nueva.
2. Crea o actualiza los archivos `subconfig`, `Resumen`, `Edicion` y `Detalle` del módulo.
3. Conserva un bloque instructivo detallado al inicio de cada subconfig para que futuros mantenedores puedan modificar campos y listas Enum con seguridad.
4. Registra todos los archivos del módulo en `00_Config/Index.html`, dentro de `#module-registry`.
5. Aplica permisos antes de renderizar datos protegidos y usa el motor compartido para comportamientos comunes.
6. Ejecuta `node generate_preview.js`; solo los archivos generados están listos para vista previa o despliegue.

## Estructura obligatoria

- Conserva `DRIVE_FOLDER_NAME`, `PARENT_TABLE`, `CHILD_TABLE` y `RELATIONAL_KEY` en el subconfig.
- Incluye las tres vistas obligatorias: resumen, edición y detalle.
- Usa `PWA_SKILLS.addDynamicRow()` cuando un módulo tenga una tabla hija.
- Usa las habilidades de diseño y funciones compartidas de esta carpeta para cambios visuales y de comportamiento compartido.
- Nunca edites manualmente `LOCAL_PREVIEW.html` ni `PROD_INDEX.html`.
