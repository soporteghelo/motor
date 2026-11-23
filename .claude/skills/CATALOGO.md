# Habilidades de MOTOR

| Habilidad | Uso |
|---|---|
| `motor-pwa-runtime` | Funciones compartidas: filtros, tablas, exportación, firmas, multimedia, sincronización y estados de carga. |
| `motor-pwa-design` | Diseño Data-Dense, tarjetas, diseño adaptable, navegación, temas y accesibilidad. Incluye `references/anchos.md`: auditoría para que nada se salga de la pantalla. Fusionada con `portal-pwa-design` (NOELY_own). |
| `motor-pwa-recorrido` | Recorrido guiado de la primera visita. **Aún sin implementar**: la skill es la especificación. Adaptada de `recorrido` (PLATAFORMA_ELEARNING). |
| `motor-pwa-builder` | Creación y mantenimiento de módulos. **Un módulo = un subconfig**; las tres vistas las genera `MOTOR_RENDER`. |
| `deploy-to-vercel` | Despliegue en Vercel (vista previa por defecto, producción solo si se pide). Importada de `vercel-labs/agent-skills`; su primera sección recoge lo propio de MOTOR: pruebas antes de desplegar, `dist/`, variables de entorno y CSP. |

El código de producción de las utilidades compartidas permanece en `00_Config/Global_Skills.js.html`; las skills de esta carpeta indican cómo usarlo y mantenerlo sin duplicarlo.
