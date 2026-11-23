---
name: motor-pwa-design
description: Diseña y mejora interfaces adaptables de MOTOR PWA con el sistema «Industrial seguro» (azul marino + amarillo de seguridad, Data-Dense), y propaga los cambios visuales compartidos a los módulos aplicables. Úsala al modificar disposición, tarjetas, tablas, formularios, navegación, comportamiento móvil, espaciado, tipografía, tokens de color, filtros, paneles, campos obligatorios, formatos de fecha y hora, desbordes horizontales o accesibilidad de la aplicación.
---

# Motor PWA: diseño

Lee `../../../design-system/motor-pwa/MASTER.md` antes de cambios visuales
relevantes. Es la referencia canónica: paleta, tipografía, componentes, reglas
de espacio y de campos obligatorios.

## Archivos de referencia

Lee la referencia más pequeña que cubra el cambio antes de tocar la interfaz:

| Necesidad | Lee |
|---|---|
| Tokens, temas, botón amarillo, foco, `.req-star`, `.field-pair` | `00_Config/Index.html` §8 (lista de tokens en `references/source.md`) |
| Tarjetas móviles sin huecos | `00_Config/Index.html` §5 y §8.b |
| Reglas previstas, especificaciones, antipatrones | `design-system/motor-pwa/MASTER.md` |
| Cómo se generan las tres vistas y los controles de cada campo | `00_Config/Motor_Render.js.html` |
| Barras de búsqueda, filtros, tablas → tarjetas, esqueletos, estados vacíos | `00_Config/Global_Skills.js.html` (`PWA_SKILLS`) |
| Cabecera, menú lateral, panel y barra inferior | `00_Config/Index.html`, `00_Config/App_Routing.js.html` |
| **Comprobar que nada se salga de la pantalla** | `references/anchos.md` |

El código es la implementación viva. Si `MASTER.md` contradice al código, manda
el código, salvo que la tarea pida explícitamente estandarizar esa regla.

## Identidad «Industrial seguro»

- **Azul marino `#162138`** = confianza, texto y cabecera. **Amarillo de seguridad `#ffd53f`** = color de la acción.
- Tipografía **Archivo**. Cabecera marino con filete inferior amarillo de 3 px. Modo oscuro marino profundo con el amarillo como acento.
- Todo botón o enlace con `bg-primary` se pinta solo en amarillo con texto marino (regla global en `00_Config/Index.html`, §8): no añadas clases de color a mano.
- **El amarillo solo se usa como relleno** (texto marino encima, 11.3:1). Nunca como color de texto sobre claro (1.4:1). Amarillo = acción, no advertencia: las alertas usan ámbar oscuro (`--st-warn-*`) y los niveles de riesgo su propia escala con texto visible.
- El origen estético es el diseño de referencia IronLink; el CSS es propio. No copies código de esa referencia.

## Flujo de trabajo

1. Inspecciona la vista objetivo en el ancho práctico más estrecho (390 px) y luego en escritorio, **con datos largos reales**.
2. Identifica todos los módulos que tengan el mismo patrón visual antes de editar: campos de entrada, barras de filtros, tarjetas, tablas, botones, navegación, tipografía o colores de estado.
3. Trata cada cambio de diseño como un estándar de toda la aplicación. Implémentalo mediante tokens compartidos, estilos globales de `Index.html` o `MOTOR_RENDER`; solo si eso no es posible, aplica el cambio equivalente a cada módulo afectado.
4. Prioriza la decisión operativa: identificador, estado principal, siguiente acción y luego contexto secundario.
5. Reutiliza los tokens `--ds-*`, `--st-*` y los del tema. Actualiza conjuntamente los temas claro y oscuro.
6. Respeta los cortes reales del proyecto: **480 px**, **639/640 px** (el salto móvil/escritorio dominante), **767/768 px** y **1024 px**. No añadas cortes nuevos para tapar un desborde; corrige la causa.
7. En tablas móviles, conserva los datos pero agrupa los campos relacionados; no presentes todas las columnas como pares etiqueta/valor de igual importancia.
8. Mantén objetivos táctiles de al menos 44 px, etiquetas visibles de 12 px o más y foco de teclado visible.
9. Cuando cambie el lenguaje visual compartido, actualiza `design-system/motor-pwa/MASTER.md` en la misma entrega: una regla que solo viva en el código se pierde.
10. Reconstruye con `node generate_preview.js` y verifica con `npm run preview` (http://localhost:3005).

## Nada fuera de pantalla

Ningún filtro, botón o campo puede quedar cortado por el borde de la pantalla en
ningún ancho. Es una regla de toda la aplicación, no de la vista que se esté
tocando: una barra que se sale deja controles imposibles de pulsar y arrastra la
página a un desplazamiento horizontal que descuadra también la tabla de abajo.

**La causa es casi siempre la misma**: una fila con un número fijo de columnas y
mínimos en píxeles. `repeat(7, minmax(110px, 1fr))` exige 770 px más las
separaciones pase lo que pase, así que en móvil el último control queda fuera.
Añadir un corte por resolución no lo arregla: solo mueve el problema al ancho
siguiente, y cada campo nuevo lo reabre.

**La forma correcta** es dejar que la fila se reajuste sola al ancho disponible:

- Rejilla: `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`. Tantas
  columnas como quepan, sin conteo fijo. El campo de texto libre (Buscar) toma
  `grid-column: span 2`.
- Fila flexible: `flex-wrap: wrap` y `flex: 1 0 <mínimo>px` por control. El
  mínimo va en `flex-basis`, no en `min-width`, para que la rejilla móvil pueda
  mandar sin arrastrar anchos pensados para escritorio.
- Un contenedor con `width: max-content` lleva **siempre** `max-width: 100%` y
  `flex-wrap: wrap`; sin eso crece más que la pantalla.
- Un campo que ya tiene `width: 100%` no necesita `min-width` en píxeles: ese
  mínimo es justo lo que desborda la columna estrecha.
- Un texto sin espacios (una ruta, un correo, un código) rompe la columna aunque
  la rejilla sea elástica: `min-width: 0` en el hijo de la rejilla más
  `overflow-wrap: anywhere` en el texto.

**La única excepción** es el desplazamiento horizontal deliberado y acotado a su
tarjeta: una tabla ancha dentro de un contenedor con `overflow-x: auto`. Ahí el
ancho mínimo es intencional y la página no se mueve. Fuera de ese caso, un
desborde es un error.

Cómo comprobarlo —auditoría del CSS y verificación en el navegador, ancho por
ancho— está en `references/anchos.md`. Ejecútalo siempre que toques una barra de
filtros, una fila de acciones o una rejilla de campos.

## Aprovechar al máximo el espacio

- **Formularios:** si dos controles cortos caben en la misma fila, van en la misma fila, también en móvil (fecha + hora, área + lugar, inicio + fin, DNI + nombre corto). Usa `grid grid-cols-2` o `.field-pair`; tres cortos en escritorio con `.field-pair.field-trio`. Solo ocupan fila completa las descripciones, los textareas, los selectores con ayuda larga, las galerías y las firmas.
- **Tarjetas móviles:** ninguna fila debe quedar casi vacía. Identificador y fecha comparten línea; el distintivo clave va a la derecha de esa línea junto a las acciones; el dato principal ocupa el ancho completo; los datos secundarios se agrupan en una sola línea (`estado · responsable … plazo`); los distintivos van juntos en una fila propia al final.
- Causa habitual del hueco: celdas con `width:100%` heredado. En módulos con tarjeta propia, las celdas llevan `width:auto` y `column-gap`; el salto entre datos y distintivos se fuerza con `tr::after { order:3; flex:0 0 100%; height:0; margin-top:-6px }`; las celdas de la fila de título declaran `flex:1 1 100%` (ver `Index.html` §8.b).
- Antes de añadir una fila nueva, comprueba si el dato cabe junto a otro.
- **Y el desperdicio al revés, en escritorio:** un formulario o un detalle no
  deben quedar en una sola columna angosta pegada a la izquierda cuando el
  contenedor ya tiene ancho. El motor usa `max-w-4xl` con rejilla de dos
  columnas (`col-span-2 md:col-span-1` por campo) justamente para eso; un bloque
  escrito a mano debe reutilizar ese patrón, no inventar anchos nuevos.
- El mismo desperdicio aparece en una **barra de filtros de un solo campo**: si
  el contenedor se estira al ancho completo mientras el campo queda limitado,
  deja una tarjeta vacía al lado. Dale `max-width: max-content` al contenedor.
- Antes de dar por terminada una vista, ábrela a **390 px** (una columna) **y**
  en escritorio (≥1024 px). Si en escritorio queda un bloque angosto con espacio
  vacío a la derecha, o una tarjeta ancha con un solo campo perdido dentro,
  falta aplicar uno de los puntos anteriores.

## Fechas y horas: un único formato

Toda fecha visible se muestra como **`DD/MM/AAAA`** y toda hora como **`HH:MM`
en 24 horas** (juntas: `23/11/2026 08:18`). Vale para tablas, detalles, PDF,
exportaciones y cualquier módulo futuro.

- **Nunca** `toLocaleTimeString('es-PE')` para una hora visible: devuelve 12
  horas con `p. m.`, que es más largo, rompe la columna estrecha y no ordena.
  Formatea los dos dígitos a mano o con un ayudante compartido.
- `PWA_SKILLS.getPeruTime(formatFull)` da la fecha y hora **actuales** en GMT-5;
  es lo correcto para sellar un registro, no para pintar un valor ya guardado.
- **En la base de datos los valores siguen guardándose en ISO** (`AAAA-MM-DD` o
  el sello completo). No los conviertas a `DD/MM/AAAA` al escribir: el orden de
  las listas y los filtros por rango comparan texto, y solo el ISO ordena igual
  como texto que como fecha. `DD/MM/AAAA` es formato de presentación, nunca de
  almacenamiento.
- Para el `value` de un `<input type="date">` usa siempre `AAAA-MM-DD`: el campo
  lo exige internamente sea cual sea el idioma, y el navegador ya lo pinta como
  dd/mm/aaaa. No recortes un ISO con zona con `slice(0,10)`: en Perú (UTC-5)
  devuelve el día equivocado cuando la hora UTC ya pasó de medianoche.
- Todo campo de fecha u hora debería abrir su selector nativo al tocarlo
  (`onclick="this.showPicker?.()"`). Nadie debe teclear una fecha dígito a
  dígito. Como los controles los genera el motor, es un solo cambio en
  `MOTOR_RENDER.campoHTML`.
- **Deuda conocida:** quedan llamadas heredadas a `toLocaleTimeString('es-PE')`
  en `App_Routing.js.html` y `Global_Skills.js.html`, y a `toLocaleDateString`
  en `PDF_Templates.js.html`. Sustitúyelas al tocar esas zonas. El saludo largo
  del menú («lunes, 23 de noviembre») es una excepción deliberada: no es un dato
  de registro.

## Formularios: vistas, no ventanas flotantes

Crear y editar son **vistas del módulo** (`changeInternalView(mod, 'Edicion')`),
con botón de volver, título y los mismos campos en alta y en edición. No uses
ventanas flotantes para altas ni ediciones: en móvil quedan estrechas, con
desplazamiento propio y sin sitio para los mensajes de error. Reserva lo
flotante para confirmaciones cortas.

## Campos con sugerencias y texto libre

Cuando un dato tenga opciones frecuentes pero la persona pueda registrar un
valor no listado (área, empresa, puesto, referencia), **no uses un `select`
cerrado**: declara el campo `Enum` con `allowOtherValues: true` en el subconfig.
El motor añade la opción «Otro…» y el campo libre, y `PWA_SKILLS.getEnumValue`
devuelve el valor escrito.

## Lo que se guarda se ve, y se ve si todavía no viajó

Guardar sin conexión y que la lista siga diciendo «sin registros» es la forma
más rápida de que alguien registre dos veces lo mismo. El registro entra en la
copia local al encolarse y aparece con el distintivo **«Por subir»** (ámbar,
con `title` que lo explica), que desaparece solo cuando la cola lo sube.

Dos consecuencias para cualquier vista nueva:

- Un estado vacío solo se pinta cuando **de verdad** no hay nada, nunca porque
  falló la consulta: sin conexión se dice «sin conexión», y si no se pudo
  contar algo se dice que no se pudo, no «no hay pendientes».
- El HTML que arma un helper ya viene escapado por dentro: **no se vuelve a
  escapar al insertarlo** (eso imprimía el `<button>` del estado vacío como
  texto en pantalla, en todos los módulos).

## Cada casilla acepta solo lo suyo

Un campo llamado «Días de descanso médico» que admite `dsdsds` no es un
descuido del usuario: es un campo mal declarado. El control tiene que
corresponder al dato, y además decide **qué teclado abre el móvil**, que es
la mitad del trabajo en campo.

| Dato | Control | Lo que lleva declarado |
|---|---|---|
| Cantidad (días, horas, personas, notas, importes) | `number` | `min` (0 por defecto), `max`, `step` (`1` entero, `0.01` dinero) |
| Fecha / hora | `date` / `time` | Abren el selector nativo al tocarlos |
| Correo | `email` | `inputmode="email"`, sin autocorrección |
| Teléfono | `tel` | `inputmode="tel"` y `pattern` sin letras |
| DNI | `text` | 6 a 8 caracteres alfanuméricos, teclado numérico (regla 8) |
| Texto libre | `text` / `textarea` | `maxLength` cuando la columna tenga tope |

**Se declara, no se adivina.** El motor deduce el control por el nombre del
campo, pero esa deducción es una red de seguridad: un campo nuevo que guarde
una cantidad lleva `control: "number"` con su rango en el subconfig. Lo mismo
en las filas hijas (`Relational_Fields`), donde las claves son las mismas.

Un rango no es decoración: «nota de 85 sobre 20» o «-3 días de descanso» son
datos que luego nadie sabe interpretar. Al guardar, el motor revisa el
formulario entero con `checkValidity()`, enfoca la primera casilla mal puesta
y no encola nada, porque un dato roto encolado sin conexión se descubre horas
después y ya no hay quién lo corrija.

## Listas largas: se escriben, no se recorren

**Toda lista con muchas opciones se filtra al escribir.** Un desplegable de
cuarenta personas obliga a recorrer la lista entera con el pulgar para encontrar
un nombre que la persona ya sabe: teclear tres letras tiene que bastar.

**Dos criterios, según de dónde salgan las opciones:**

| Qué lista | Cuándo lleva buscador |
|---|---|
| **`REF`** — opciones de otro módulo (personal, supervisores, IPERC de referencia) | **Siempre**, desde la segunda opción |
| **`Enum`** — valores fijos del subconfig (áreas, categorías, temas) | A partir de **9** opciones |

Un campo de personal **no espera al umbral**: la obra empieza con ocho nombres y
acaba con doscientos, y el campo no puede cambiar de comportamiento a mitad del
año —ni obligar a nadie a volver a tocarlo cuando crezca—. Un catálogo cerrado de
cuatro estados, en cambio, se lee de un vistazo y el `select` nativo es más
rápido.

Alcanza igual a los `select` de una fila hija (`PWA_SKILLS.addDynamicRow` con
`type: "select"`) y a los del panel de filtros del Resumen. Para forzarlo en un
`Enum` corto: `buscador: true` en la variable del subconfig (o `data-buscador`
en un `<select>` escrito a mano).

El patrón: un `input` editable que filtra **sin distinguir mayúsculas ni
tildes** y por subcadena (buscar «quispe» encuentra «María Quispe Mamani»),
que **nunca** sustituye lo que la persona escribió, muestra las coincidencias
en una lista desplegable y deja claro cuándo no hay ninguna. Se expone como
`role="combobox"` con `aria-autocomplete="list"`, `aria-expanded`,
`aria-controls` y un `role="listbox"`; `Escape` cierra, `ArrowDown`/`ArrowUp`
recorren, `Enter` selecciona la opción resaltada y al salir del campo sin
elegir ninguna el valor vuelve al último seleccionado (un texto a medio
escribir nunca se guarda). Área táctil ≥44 px por opción, texto ≥12 px y
teclado del móvil sin autocorrección (`autocomplete="off"`).

**Ya está hecho y es automático.** El componente vive en `Global_Skills.js.html`
(«SKILL 28») y un observador global lo monta sobre todo `<select>` que supere el
umbral, venga del motor, de una fila hija, del panel de filtros o de una vista
escrita a mano. **No hay que llamar a nada ni tocar ningún módulo**: un campo
`REF` nuevo o un `Enum` que crece lo reciben solos.

- Se monta **encima del `<select>` real**, que sigue en el formulario con su
  `name` y su `value`: la cola offline, el Detalle, el PDF y todo el código que
  hace `select.value` funcionan igual aunque el componente falle. Elegir una
  opción dispara `change`, así que los enums con «Otro…» y los campos en
  cascada siguen reaccionando.
- `required` pasa del select escondido al campo visible: el aviso del navegador
  se ve donde la persona está mirando.
- El texto se pone al día solo cuando otro código asigna `select.value` (la
  precarga de la Edición) o cuando llegan las opciones de `loadRelationalOptions`.
- Para dejar un desplegable sin buscador: `data-sin-buscador` en el `select`.
- A mano, si hiciera falta: `PWA_SKILLS.selectBuscable(select)` monta uno y
  `PWA_SKILLS.mejorarSelects(root)` repasa un trozo del DOM.

## Sincronización: un único botón para toda la app

El botón de la cabecera (`#ui-global-sync-btn` →
`PWA_SKILLS.triggerGlobalSync()`) es **el único control de sincronización de la
aplicación**, presente y futura.

- **Nunca** añadas botones de «Sincronizar», «Actualizar» o «Recargar» dentro de
  un módulo, panel, tabla, cabecera o barra de acciones. Si encuentras uno,
  quítalo.
- La marca de frescura («Actualizado 16:47», «Última sincronización…») es texto,
  nunca un botón. Los mensajes remiten al botón de la cabecera.
- **Un diagnóstico no es una sincronización.** La regla prohíbe botones que
  *traigan datos*, no los que *comprueben el enlace*. Una comprobación de
  conexión en Configuración es legítima si es de solo lectura, no refresca
  ninguna caché y no reenvía la cola. La cola pendiente se muestra como texto y
  remite al botón de la cabecera para enviarla.

## Acciones inferiores siempre visibles

- Toda vista con botones al final deja una separación inferior adicional, para
  que el último botón no quede bajo la barra del navegador ni bajo el gesto del
  sistema. La barra inferior fija usa `bottom: 0` y suma
  `env(safe-area-inset-bottom)` a su `padding-bottom`; **nunca** un `bottom`
  negativo.
- Las ventanas flotantes largas se estructuran como columna flex: cabecera de
  altura real y cuerpo `flex: 1; min-height: 0; overflow-y: auto`. No calcules
  el alto del cuerpo restando una altura fija de cabecera: los títulos envuelven.
- Verifica a 390 px que el último botón se vea completo, con espacio debajo, y
  con contenido largo.

## Campos obligatorios

- **Todo valor obligatorio lleva un asterisco rojo en su etiqueta.** Declara los ids en la raíz del formulario: `data-obligatorios="id1 id2 …"`. `PWA_SKILLS.marcarObligatorios(vista)` (se llama sola al abrir la Edición) añade `<span class="req-star">*</span>`, `aria-required="true"` y unifica los asteriscos escritos a mano; también marca cualquier control con `required`.
- La lista debe coincidir con la validación de guardado y con `required: true` del subconfig. Un módulo nuevo no se entrega sin ella.

## Reglas generales

- No introduzcas colores hexadecimales directos en vistas de módulos; usa tokens semánticos (`--ds-*`, `--st-*`, utilidades Tailwind del tema).
- No crees tarjetas repetidas únicamente para enmarcar datos relacionados.
- Evita suposiciones de ancho de escritorio en filtros, controles, tarjetas y navegación.
- Usa un tamaño tipográfico compacto solo en controles breves y densos, como búsqueda o filtros; conserva 16 px en campos normales de formularios (menos de 16 px hace que iOS amplíe la pantalla al enfocar).
- En barras de búsqueda y filtros dinámicos, usa el patrón compartido `filter-compact-control`: 12 px, interlineado 1.2 y contenedores de 36 px (`h-9`). Aplícalo globalmente mediante `PWA_SKILLS`.
- **Todo destino de navegación lleva icono y texto**; el activo se marca con `aria-current`. Los botones solo-icono llevan `aria-label` y los iconos decorativos `aria-hidden="true"`.
- La tipografía es **Archivo** y los iconos vienen de **Material Symbols Outlined**. Nunca emojis como iconos ni una segunda librería de iconos.
- Las transiciones duran entre 150 y 300 ms y se desactivan bajo `prefers-reduced-motion`.
- El significado nunca depende solo del color: lo acompaña un icono, un texto o una forma.
- Replica cambios de tamaño de letra, colores, tarjetas, espaciado, controles y comportamiento responsivo en cada módulo que use el mismo patrón. Adapta solo la jerarquía de contenido cuando un módulo tenga datos operativos distintos.
- Un único botón amarillo (acción principal) por vista.
- No edites directamente los bundles de vista previa o producción (`PROD_INDEX.html`, `LOCAL_PREVIEW.html`, `dist/`).

## Comprobación final

Antes de entregar, confirma que:

- Todo control nuevo tiene un estado de foco de teclado visible.
- El contraste es correcto en tema claro **y** oscuro.
- La disposición responde bien a 390, 480, 640, 768, 1024 y 1440 px.
- Ningún filtro, botón o campo queda cortado y la página no se desplaza en horizontal en **ningún** ancho (`references/anchos.md` devuelve `total: 0` y `scrollX: 0`).
- Las fechas se ven `DD/MM/AAAA` y las horas `HH:MM`, y lo guardado sigue en ISO.
- Toda carga de más de 300 ms muestra `renderSkeleton()` y todo resultado vacío muestra `showEmptyState()` con acción de salida.
- Las acciones inferiores se ven completas, con espacio bajo el último botón.
- Ninguna regla quedó duplicada donde un token o `PWA_SKILLS` ya podía expresarla.
- `node generate_preview.js` y `npm test` terminan sin errores.
