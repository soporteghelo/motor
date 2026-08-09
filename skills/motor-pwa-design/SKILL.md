---
name: motor-pwa-design
description: Diseña y mejora interfaces adaptables de MOTOR PWA con el sistema Data-Dense Dashboard, y propaga los cambios visuales compartidos a los módulos aplicables. Úsala al modificar disposición, tarjetas, tablas, navegación, comportamiento móvil, espaciado, tipografía, tokens de color, filtros, paneles o accesibilidad de la aplicación.
---

# Motor PWA: diseño

Lee `../../design-system/motor-pwa/MASTER.md` antes de cambios visuales relevantes. Es la referencia canónica de diseño.

## Flujo de trabajo

1. Inspecciona primero la vista objetivo en el ancho práctico más estrecho y luego en escritorio.
2. Identifica todos los módulos que tengan el mismo patrón visual antes de editar: campos de entrada, barras de filtros, tarjetas, tablas, botones, navegación, tipografía o colores de estado.
3. Trata cada cambio de diseño como un estándar de toda la aplicación. Implémentalo mediante tokens compartidos o estilos globales cuando sea posible; de lo contrario, aplica el cambio equivalente a cada módulo afectado.
4. Prioriza la decisión operativa: identificador, estado principal, siguiente acción y luego contexto secundario.
5. Reutiliza los tokens `--ds-*` y los tokens de tema configurados. Actualiza conjuntamente los temas claro y oscuro.
6. En tablas móviles, conserva los datos pero agrupa los campos relacionados; no presentes todas las columnas como pares etiqueta/valor de igual importancia.
7. Mantén objetivos táctiles de al menos 44 px, etiquetas visibles de 12 px o más y foco de teclado visible.
8. Reconstruye con `node generate_preview.js` y verifica los archivos generados.

## Reglas obligatorias

- No introduzcas colores hexadecimales directos en vistas de módulos; usa tokens semánticos.
- No crees tarjetas repetidas únicamente para enmarcar datos relacionados.
- Evita suposiciones de ancho de escritorio en filtros, controles, tarjetas y navegación.
- Usa un tamaño tipográfico compacto solo en controles breves y densos, como búsqueda o filtros; conserva un tamaño cómodo en campos normales de formularios.
- En barras de búsqueda y filtros dinámicos, usa el patrón compartido `filter-compact-control`: 12 px, interlineado 1.2 y contenedores de 36 px (`h-9`). Aplícalo globalmente mediante `PWA_SKILLS` para que los valores, fechas, selects y placeholders entren sin recorte en todos los módulos.
- Replica cambios de tamaño de letra, colores, tarjetas, espaciado, controles y comportamiento responsivo en cada módulo que use el mismo patrón. Adapta solo la jerarquía de contenido cuando un módulo tenga datos operativos distintos; no dejes equivalentes visualmente inconsistentes.
- No edites directamente los bundles de vista previa o producción.
