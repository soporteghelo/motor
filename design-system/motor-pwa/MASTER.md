# Sistema de diseño MOTOR PWA — «Industrial seguro»

> **Lógica:** al construir una página concreta, revisa primero `design-system/motor-pwa/pages/[pagina].md`.
> Si existe, sus reglas **prevalecen** sobre este archivo. Si no, sigue lo de abajo.

**Proyecto:** MOTOR PWA · **Estilo:** Data-Dense Dashboard + identidad «Industrial seguro»
**Inspiración:** diseño móvil de referencia *IronLink* (azul marino + amarillo de seguridad, tipografía de ingeniería).
El CSS es propio de MOTOR: no se copió código de la referencia (no tiene licencia).

El azul marino transmite confianza y es el color del texto; el **amarillo de seguridad es el color de la acción**.

---

## 1. Paleta

Todo vive en `00_Config/Index.html`: colores Tailwind (`tailwind.config`) y tokens CSS. Los módulos **nunca** llevan hex crudos.

| Rol | Claro | Oscuro | Token / clase |
|---|---|---|---|
| Marino de marca (texto, acciones oscuras) | `#162138` | `#dce5fa` (texto) | `--color-primary`, `text-primary` |
| **Acción principal** | `#ffd53f` | `#ffd53f` | `--brand-accent`; todo `button.bg-primary` |
| Texto sobre el amarillo | `#162138` | `#162138` | `--brand-ink` |
| Fondo de app | `#f4f6fb` | `#0c1424` | `--color-bg` |
| Tarjeta / fila | `#ffffff` | `#141f36` | `--ds-surface` |
| Zona hundida (cabecera de tabla) | `#f7f9fd` | `#1a2745` | `--ds-surface-sunken` |
| Texto principal | `#162138` | `#eef2fa` | `--ds-fg` |
| Texto secundario | `#4f5c78` | `#aeb9d0` | `--ds-fg-muted` |
| Borde | `#d3daea` | `#26355a` | `--ds-border` |
| Cabecera global | `#162138` | `#0a1020` | `--header-bg` |

**Estados** (distintivos pintados desde JS): `--st-ok-*`, `--st-lime-*`, `--st-warn-*`, `--st-bad-*`, `--st-crit-*`, `--st-mute-*`, `--st-info-*`, cada uno con `-bg`, `-fg` y `-bd` y su pareja oscura. Úsalos en estilos en línea: `style="background:var(--st-ok-bg);color:var(--st-ok-fg)"`.

### Reglas del amarillo (no negociables)

1. **Solo como relleno**, siempre con texto marino encima (11.3:1). **Jamás como color de texto** sobre claro (1.4:1, incumple 4.5:1).
2. **Amarillo = acción, no advertencia.** Las advertencias usan ámbar oscuro sobre ámbar claro (`--st-warn-*`); los niveles de riesgo tienen su propia escala (Bajo verde · Medio ámbar · Alto rojo · Crítico negro) y siempre llevan **texto**, no solo color.
3. Un solo botón amarillo por vista (la acción principal). El resto: contorno o marino.

### Contraste verificado

| Par | Razón |
|---|---|
| Texto `#162138` sobre blanco / sobre fondo | 16.0:1 / 14.8:1 |
| Texto secundario `#4f5c78` sobre blanco / fondo | 6.7:1 / 6.2:1 |
| Marino sobre amarillo (botón) | 11.3:1 |
| Estados en claro (ok / warn / bad / info) | 4.7 · 5.6 · 6.0 · 5.6 |
| Oscuro: texto / secundario sobre tarjeta | 14.6:1 / 8.3:1 |
| Oscuro: estados sobre su tinte | 5.8 – 7.5:1 |

---

## 2. Tipografía

**Archivo** (400–900), cargada desde Google Fonts, en toda la app.
Mínimo 12 px en cualquier texto visible; **campos de formulario a 16 px** (evita el auto-zoom de iOS); cifras con `tabular-nums` en columnas de datos. Titulares con `letter-spacing: -.015em`.

## 3. Componentes

- **Cabecera global:** marino con **filete inferior amarillo de 3 px**; todos sus controles heredan el blanco.
- **Botón principal:** `button/a.bg-primary` se pinta solo en amarillo con texto marino (regla global en `Index.html`, §8). No hay que añadir clases.
- **Campos:** borde `outline-variant`; al enfocar, **borde marino + halo amarillo de 3 px** (en oscuro, borde amarillo).
- **Tarjetas:** `rounded-2xl`, borde 1 px, sombra suave (`--ds-shadow`).
- **Distintivos (chips):** punto de color + texto; nunca solo color.
- **Indicadores KPI:** barra de acento a la izquierda (rojo = crítico, ámbar = atención, verde = bien, marino = neutro).
- **Drawer:** cabecera marino con filete amarillo; el destino activo lleva tinte amarillo claro y borde derecho amarillo.
- **Pasos de avance** (detalle): hecho = marino lleno; actual = amarillo con borde marino; pendiente = hueco.

## 4. Aprovechar al máximo el espacio (regla obligatoria)

El ancho útil es escaso, sobre todo en móvil. **Antes de añadir una fila nueva, pregunta si el dato cabe en una existente.**

**Formularios**
- Dos controles cortos (fecha + hora, área + lugar, DNI + nombre corto, inicio + fin) van **en la misma fila**, también en móvil (`grid grid-cols-2` o `.field-pair`). Tres cortos en escritorio: `.field-pair.field-trio`.
- Solo ocupan fila completa: descripciones, textareas, selectores con texto de ayuda largo, galerías, firmas.
- Etiqueta pegada a su campo; separación entre secciones mayor que entre campos.

**Tarjetas móviles (tabla → tarjeta)**
- **Nada de filas casi vacías.** Identificador y fecha comparten línea; el distintivo de área/estado clave va a la derecha de esa línea, junto a las acciones.
- El dato principal (hallazgo, tipo de trabajo, categoría) ocupa **ancho completo**; los datos secundarios se agrupan en una sola línea (`estado · responsable ……… plazo`).
- Los distintivos van **juntos en una fila propia** al final, y envuelven solo si no caben.
- Mecanismo en `Index.html` (§5 y §8.b): las celdas usan `width:auto` (antes `100%` hacía que cada dato cayera en su propia línea) y `column-gap:10px`; el salto entre «datos» y «distintivos» se fuerza con `tr::after { order:3; flex:0 0 100%; height:0; margin-top:-6px }`. Las celdas de la fila de título declaran `flex:1 1 100%` para no mezclarse con los datos.
- Probar siempre a 390 px **con datos reales largos** (nombres, descripciones), no solo con los de muestra.

## 5. Campos obligatorios (regla obligatoria)

**Todo valor obligatorio lleva un asterisco rojo (`*`) en su etiqueta.**

- En el formulario, el contenedor raíz declara los ids obligatorios: `<div id="module-XX-edicion" data-obligatorios="xx-fecha xx-tipo xx-desc" class="module-view">`.
- `PWA_SKILLS.marcarObligatorios(vista)` (se invoca sola al abrir la Edición) añade `<span class="req-star">*</span>` a cada etiqueta, pone `aria-required="true"` y unifica los asteriscos escritos a mano. También marca cualquier control con `required`.
- La lista debe coincidir con la validación del guardado (`faltan.push([...])`) y con `required: true` del subconfig.
- Si hay campos obligatorios, el subtítulo del formulario lo dice: «Complete los campos obligatorios (*)».

## 6. Modo oscuro

Se diseña en pareja con el claro: fondo marino profundo, tarjetas `#141f36`, texto casi blanco, **amarillo como acento** (botón y filete). El texto de énfasis es azul muy claro, **nunca amarillo**. Los colores de Tailwind (`bg-amber-50`, `text-red-700`…) se remapean bajo `[data-theme="dark"]` en `Index.html`.

> El color primario por empresa (Configuración) sigue siendo editable. Con el valor por defecto (`#162138`) no se fija nada en línea para que el modo oscuro pueda aclararlo.

## 7. Estados de interfaz

- Carga > 300 ms → `renderSkeleton()`; vacío → `showEmptyState()` con acción; conexión caída → aviso ámbar; registro en cola → marca «En cola» (ámbar).
- Error de campo: borde y fondo rojo suave + mensaje con icono debajo (nunca solo color).

---

## Anti-patrones

- ❌ Hex crudos en módulos (usar `--ds-*`, `--st-*` o utilidades Tailwind del tema).
- ❌ Amarillo como color de texto o como único indicador de riesgo.
- ❌ Una fila para un dato que cabe junto a otro; dos campos cortos en filas separadas.
- ❌ Campo obligatorio sin asterisco, o asterisco que no coincide con la validación.
- ❌ Iconos con emojis (usar Material Symbols, con `aria-hidden` si son decorativos).
- ❌ Cambios de estado sin transición (150–300 ms) o ignorar `prefers-reduced-motion`.
- ❌ Foco invisible; área táctil < 44 px; texto < 12 px.

## Lista de verificación antes de entregar

- [ ] Claro **y** oscuro revisados; contraste ≥ 4.5:1 (≥ 3:1 en texto grande)
- [ ] Probado a 390 px y a escritorio, con datos largos
- [ ] Sin filas casi vacías en tarjetas; campos cortos emparejados en formularios
- [ ] Obligatorios con asterisco (`data-obligatorios`) y coincidentes con la validación
- [ ] Un único botón amarillo por vista; amarillo nunca como texto
- [ ] Botones solo-icono con `aria-label`; foco visible; `prefers-reduced-motion` respetado
- [ ] `node generate_preview.js` ejecutado
