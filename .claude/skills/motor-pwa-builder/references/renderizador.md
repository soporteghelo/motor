# MOTOR_RENDER — referencia

Fuente canónica: `00_Config/Motor_Render.js.html`.

El router (`showView`) busca `#module-<modulo>-<vista>` en `#module-registry`.
Si existe, usa esa vista a mano. Si no, llama a `MOTOR_RENDER.construir()` y
registra `loadResumen_X` / `loadEdicion_X` / `loadDetail_X` automáticamente.

## Tipos de campo → control generado

| `type` del subconfig | Control | Notas |
|---|---|---|
| `Hidden_UUID`, `Hidden` | — | Nunca se pinta |
| `Text` | input de texto | El nombre decide variantes (abajo) |
| `Date` | selector de fecha | Si se llama `Fecha*`, se precarga hoy |
| `Enum` | lista desplegable | Con `allowOtherValues`, añade "Otro…" + campo libre |
| `REF` | lista cargada de otro módulo | Usa `relationalDataOrigin` y `slice` |
| `Password` | input de contraseña | |
| `Image` | selector de 1 imagen + vista previa | Se comprime con la calidad configurada |
| `Image_Collection` | selector múltiple + galería | |
| `Face_Photo` | cámara frontal: detecta el rostro y dispara la foto sola a los 3 s bien encuadrado | Igual que `Image` + `captura: "rostro"`. Sin cámara o sin modelo ofrece foto manual / cámara del teléfono |
| `Signature` | pizarra de firma + "Limpiar" | Solo viaja si se dibujó algo |
| `File` | selector de archivo | Cualquier tipo |

**Variantes deducidas del nombre** (cuando `type: "Text"`):

| Patrón en el nombre | Control |
|---|---|
| `Hora`, `*_Hora`, `Hora_*` | hora |
| `Dias`, `Horas`, `Minutos`, `Edad`, `Cantidad`, `Num`, `Nro`, `Numero`, `Total`, `Nota`, `Puntaje`, `Monto`, `Costo`, `Precio`, `Importe`, `Peso`, `Porcentaje` (como palabra), más `Duracion*`, `*_Min`, `Total_*`, `N_*` | número |
| `Email`, `Correo` | correo |
| `Celular`, `Telefono`, `Tel`, `Movil`, `Whatsapp` | teléfono |
| `Descripcion`, `Observacion`, `Puntos`, `Compromis`, `Detalle`, `Medida`, `Causa`, `Recomendacion`, `Conclusion`, `Acuerdo`, `Hallazgo`, `Comentario` | área de varias líneas (ocupa la fila entera) |
| El nombre o la etiqueta mencionan `DNI` | texto de 6 a 8 caracteres alfanuméricos, teclado numérico |

Para imponer otro control: `{ type: "Text", control: "number" }`.
Controles válidos: `text`, `time`, `number`, `email`, `tel`, `date`,
`textarea`, `select`, `ref`, `password`, `imagen`, `firma`, `archivo`,
`rostro`.

**Lo que acepta cada casilla (regla 28).** Deducir el tipo por el nombre es
una ayuda, no una garantía: lo que manda es declararlo. Una variable puede
acotar su control y el motor lo traslada al `<input>`:

| Clave | Para qué | Dónde aplica |
|---|---|---|
| `min` / `max` | Rango admitido (en número, el mínimo por defecto es **0**) | `number` |
| `step` | Paso; `1` entero, `0.01` dos decimales. Decide también el teclado del móvil (`numeric` o `decimal`) | `number` |
| `maxLength` | Tope de caracteres | `text`, `textarea` |
| `pattern` | Expresión regular que debe cumplir | `text`, `tel`, `email` |
| `placeholder` | Texto de ejemplo | todos |

```javascript
"Dias_Descanso": { type: "Text", label: "Días de descanso médico",
                   control: "number", min: 0, max: 999, step: 1 },
"Costo_Danos":   { type: "Text", control: "number", min: 0, step: 0.01 }
```

Las mismas claves valen en una fila hija (`Relational_Fields`):
`{ name: "Nota", type: "number", min: 0, max: 20, step: 0.1 }`.

Al guardar, `MOTOR_RENDER.guardar()` revisa el formulario entero —incluidas
las filas del detalle— con `checkValidity()`, enfoca la primera casilla mal
puesta y no encola nada. El navegador ya impide teclear letras en un campo
numérico; esto cubre lo que él no ve: pegar, autocompletar y los valores
fuera de rango.

Ancho: media fila por defecto (dos campos por línea también en móvil, regla
24). Fila entera para textos largos, galerías, firmas y archivos, o con
`anchoCompleto: true`.

## Bloque `Vistas`

```javascript
Vistas: {
  Subtitulo: "texto bajo el título del Resumen",

  Resumen: {
    etiquetaCrear: "Registrar",      // texto del botón principal
    ordenPor: "Fecha",               // descendente; por defecto, el primer campo Date
    columnas: [
      "Campo",                                      // forma corta
      { campo: "Campo", etiqueta: "Título",
        sub: "OtroCampo",                           // segunda línea, más pequeña
        tipo: "badge",                              // distintivo de color
        numero: true,                               // alinea cifras
        render: "nombreDelGancho" }                 // columna calculada
    ],
    vacio: { icono, titulo, mensaje, accion }
  },

  Edicion: {
    tituloNuevo: "...", tituloEditar: "...",
    secciones: [ { titulo, icono, campos: ["A", "B"] } ]
  },

  Detalle: {
    titulo: "Campo",                 // da el encabezado (y titula el informe PDF)
    subtitulo: ["Area", "Fecha"],    // texto junto a los distintivos
    secciones: [ { titulo, campos: [...] } ],
    galeria: ["Foto", "Firma"]       // por defecto, los campos de archivo sueltos
  },

  Hijos: { titulo, icono, vacio, vacioDetalle },

  Badges: {
    Estado: { "Abierto": { tono: "warn", icono: "schedule" },
              "Cerrado": "ok" }      // forma corta: solo el tono
  }
}
```

**Tonos** (tokens `--st-*`, se adaptan solos al modo oscuro):
`ok` · `lime` · `warn` · `bad` · `crit` · `mute` · `info`.

Un campo que aparece en `Badges` se pinta como distintivo en toda la app,
aunque la columna no declare `tipo: "badge"`.

La cabecera del Detalle trae tres acciones, puestas por el motor:
**Editar** (`data-permiso="editar"`), **PDF** —abre el informe en el visor
dentro de la app— y **Enviar** —lo manda por WhatsApp, adjunto o por enlace—.
Las tres se ocultan si el registro no existe. El informe se archiva solo y se
borra con el registro; nada de eso se declara por módulo (ver
`../../motor-pwa-runtime/references/informes.md`).

## Ganchos (`MOTOR_HOOKS[modulo]`)

| Clave | Cuándo | Recibe |
|---|---|---|
| `columnas.<nombre>` | Al pintar una celda con `render` | `(fila, MOTOR_RENDER)` → HTML **ya escapado** |
| `resumen` | Tras pintar la tabla | `{ modulo, filas, orden }` |
| `edicion` | Tras preparar el formulario | `{ modulo, uuid, registro, root, nuevo }` |
| `detalle` | Tras pintar el detalle | `{ modulo, registro, uuid, root }` |
| `antesDeGuardar` | Antes de encolar | `{ modulo, datos, hijos }` · `false` cancela |

Los ganchos se invocan sobre su propio objeto, así que pueden llamarse entre
sí con `this`. Una excepción dentro de un gancho se registra en consola y no
rompe la vista.

## API útil desde un gancho

| Llamada | Para qué |
|---|---|
| `MOTOR_RENDER.kpis(modulo, tarjetas)` | Fila de indicadores. Cada tarjeta: `{ tono, etiqueta, valor, filtro? }`; con `filtro` se vuelve un botón |
| `MOTOR_RENDER.pintarTabla(modulo, filas)` | Repinta el listado con un subconjunto (lo usan los indicadores) |
| `MOTOR_RENDER.agregarFila(modulo, valores)` | Añade una fila al detalle |
| `MOTOR_RENDER.contarHijos(modulo)` | Refresca el contador del detalle |
| `MOTOR_RENDER._datos[modulo]` | Filas cargadas (ya filtradas por alcance) |
| `MOTOR_RENDER.variables(modulo)` / `cfg` / `titulo` / `slug` | Lectura del subconfig |

## Identificadores generados

Con `slug = 'm' + modulo en minúsculas con guiones`:

| Elemento | Id |
|---|---|
| Campo del formulario | `<slug>-f-<NombreDelCampo>` |
| Valor libre de un Enum | `<slug>-f-<Campo>-otro` |
| Vista previa de archivos | `<slug>-f-<Campo>-preview` |
| Panel de captura facial | `<slug>-f-<Campo>` (lo rellena `FACE_CAPTURE`) |
| UUID oculto | `<slug>-uuid` |
| Cuerpo de la tabla | `<slug>-body` |
| Contenedor del detalle | `<slug>-hijos` |
| Ranura de indicadores | `<slug>-kpis` |
| Ranura libre del Resumen | `<slug>-extra` |

Ejemplo: `10_Charlas` → `m10-charlas-f-Tema`.

Al buscarlos desde un gancho usar siempre `ctx.root.querySelector(...)`: las
vistas se clonan dentro de `#main-container` y los ids existen dos veces.

## Qué hace el motor al guardar

1. Recoge los campos declarados, resuelve enums con valor libre, convierte
   la firma a imagen y junta los archivos elegidos.
2. Rellena `Registrado_Por` y `Fecha_Registro` si el subconfig los declara.
3. Copia el nombre visible de un `REF` al campo gemelo sin sufijo
   (`Expositor_DNI` → `Expositor`), si existe.
4. Arma las filas hijas y **descarta las vacías**.
5. Valida los obligatorios que el formulario muestra; si falta alguno, lleva
   el foco al primero y no guarda.
6. Llama a `antesDeGuardar`; si devuelve `false`, se detiene.
7. `pushToQueue(modulo, 'SYNC_OFFLINE_QUEUE', datos, hijos)` y vuelve al listado.

El formulario se limpia por completo al abrirlo, también al pasar de editar
un registro a crear otro.
