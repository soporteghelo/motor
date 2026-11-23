---
name: motor-pwa-builder
description: Construye o amplía módulos de MOTOR PWA. Un módulo es UN archivo subconfig que describe datos y vistas; MOTOR_RENDER dibuja Resumen, Edición y Detalle a partir de él. Úsala al crear un módulo, agregar o cambiar campos, columnas, secciones, distintivos de estado, tablas hijas, permisos o registro.
---

# Motor PWA: constructor de módulos

Lee `../../../CLAUDE.md` antes de empezar. La referencia de las tres vistas generadas está en `references/renderizador.md`.

## Regla número uno

**Un módulo es un solo archivo: su `subconfig`.** No se escribe HTML por módulo.
`00_Config/Motor_Render.js.html` (`MOTOR_RENDER`) construye Resumen, Edición y
Detalle leyendo `Variables` (qué datos hay) y `Vistas` (cómo se ven).

Antes, cada módulo repetía ~830 líneas de HTML que describían por segunda vez
los mismos campos. Agregar un campo obligaba a tocar cuatro archivos y era
fácil olvidar uno: así nacieron bugs como el detalle de la tabla hija, que
cuatro módulos leían de una propiedad que nadie llenaba y siempre salía vacío.

## Crear un módulo nuevo

1. **Carpeta y subconfig.** `11_MiModulo/subconfig_11_MiModulo.js.html` con
   `Config_Modular`, `Variables` y `Vistas` (ver plantilla abajo).
2. **Registro.** Una línea en `00_Config/Index.html`, dentro de `#module-registry`:
   ```html
   <?!= include('11_MiModulo/subconfig_11_MiModulo.js'); ?>
   ```
   No hace falta tocar el menú, el panel ni el router: el módulo aparece solo
   (`PERMISOS.modulos()` lo descubre y le da tarjeta y enlace con su
   `Titulo` y `Card_Icon`). Solo se escribe un enlace a mano si se quiere en
   un sitio concreto, y entonces lleva `data-modulo="11_MiModulo"`.
3. **Base de datos.** `node tools/gen_supabase.js` y aplicar el SQL. El
   esquema, las políticas RLS y el aislamiento de archivos salen del subconfig.
4. **Compilar y probar.** `node generate_preview.js` y `npm test`.

## Plantilla de subconfig

```javascript
var SUBCONFIG_11_MIMODULO = {
  Config_Modular: {
    NombreInterno:     "11_MiModulo",
    Titulo:            "Mi Módulo",        // nombre visible (menú, panel, cabeceras)
    Card_Icon:         "widgets",          // Material Symbols
    Card_Image:        "Foto",             // columna con miniatura en la tarjeta móvil
    DRIVE_FOLDER_NAME: "11_MiModulo_DB",
    PARENT_TABLE:      "MAIN",
    CHILD_TABLE:       "ITEMS",            // "" si no hay detalle
    RELATIONAL_KEY:    "PARENT_UUID",
    Relational_Fields: [                   // columnas de la tabla hija
      { name: "Item",   label: "Ítem",   type: "text",   colSpan: "md:col-span-5" },
      { name: "Cumple", label: "Cumple", type: "select", options: ["Sí", "No"] }
    ],
    AdminRole:      { canCreate: true,  canRead: true, canUpdate: true,  canDelete: true,  alcance: "todos" },
    SupervisorRole: { canCreate: true,  canRead: true, canUpdate: true,  canDelete: false, alcance: "responsable" },
    TrabajadorRole: { canCreate: true,  canRead: true, canUpdate: false, canDelete: false, alcance: "propios" }
  },

  Variables: {
    "UUID":        { type: "Hidden_UUID", required: true },
    "Fecha":       { type: "Date", required: true,  isFilter: true,  label: "Fecha" },
    "Area":        { type: "Enum", required: true,  isFilter: true,  label: "Área",
                     acceptedValues: ["Mina", "Planta"], allowOtherValues: true },
    "Responsable_DNI": { type: "REF", required: false, label: "Responsable",
                         relationalDataOrigin: "01_Usuarios" },
    "Descripcion": { type: "Text", required: true,  isFilter: false, label: "Descripción" },
    "Estado":      { type: "Enum", required: true,  isFilter: true,  label: "Estado",
                     acceptedValues: ["Abierto", "Cerrado"] },
    "Foto":        { type: "Image_Collection", required: false, label: "Evidencia" },
    "Foto_ID":     { type: "Hidden" },
    "Foto_Path":   { type: "Hidden" }
  },

  Vistas: {
    Subtitulo: "Para qué sirve este módulo",
    Resumen: {
      etiquetaCrear: "Registrar", ordenPor: "Fecha",
      columnas: [
        { campo: "Fecha" },
        { campo: "Area", sub: "Responsable_DNI", etiqueta: "Área / Responsable" },
        { campo: "Estado", tipo: "badge" }
      ],
      vacio: { icono: "widgets", titulo: "Sin registros",
               mensaje: "Por qué conviene registrar el primero.", accion: "Registrar" }
    },
    Edicion: {
      tituloNuevo: "Registrar", tituloEditar: "Editar",
      secciones: [
        { titulo: "Datos", icono: "event", campos: ["Fecha", "Area", "Responsable_DNI"] },
        { titulo: "Detalle", icono: "edit_note", campos: ["Descripcion", "Estado"] },
        { titulo: "Evidencia", icono: "photo_camera", campos: ["Foto"] }
      ]
    },
    Detalle: {
      titulo: "Area", subtitulo: ["Fecha"],
      secciones: [
        { titulo: "Datos", campos: ["Fecha", "Area", "Responsable_DNI", "Estado"] },
        { titulo: "Descripción", campos: ["Descripcion"] }
      ]
    },
    Hijos: { titulo: "Ítems", icono: "checklist",
             vacio: "Agrega los ítems.", vacioDetalle: "Sin ítems registrados." },
    Badges: {
      Estado: { "Abierto": { tono: "warn", icono: "schedule" },
                "Cerrado": { tono: "ok",   icono: "task_alt" } }
    }
  }
};
```

`Vistas` es **opcional**: sin él el motor deduce columnas (los campos con
`isFilter`), secciones y detalle a partir de `Variables`. Se escribe para
afinar el orden, los grupos y los colores de estado.

## Qué deduce el motor y qué no

| Decide el motor | Lo declaras tú |
|---|---|
| Control de cada campo según `type` y nombre (fecha, hora, número, párrafo, lista, firma, archivo) | `control:` en la variable si quieres otro |
| Asterisco de obligatorio y validación de guardado | `required: true` en la variable |
| Filtros, búsqueda, orden, tarjetas móviles, esqueleto y estado vacío | Textos del estado vacío en `Vistas.Resumen.vacio` |
| Alcance por rol antes de pintar, botones por permiso | La matriz de roles en `Config_Modular` |
| Tabla hija: alta, precarga al editar y lista en el Detalle | Columnas en `Relational_Fields`, textos en `Vistas.Hijos` |
| Subida de archivos, galerías y firmas | Nada |
| PDF del registro | Nada |

Campos como `Registrado_Por` o `Fecha_Registro` los rellena el motor al
guardar y nunca se piden en el formulario.

## Lo propio del módulo: ganchos

Lo que el motor no puede deducir —indicadores, tableros, cálculos— va en
`MOTOR_HOOKS`, al final del mismo subconfig:

```javascript
// Los subconfigs se cargan ANTES que Motor_Render.js
window.MOTOR_HOOKS = window.MOTOR_HOOKS || {};

MOTOR_HOOKS["11_MiModulo"] = {
  // Columna calculada: se referencia con { campo: "X", render: "miColumna" }
  columnas: { miColumna: function (fila) { return '<span>…</span>'; } },

  resumen:  function (ctx) { MOTOR_RENDER.kpis("11_MiModulo", [ /* tarjetas */ ]); },
  edicion:  function (ctx) { /* ctx.root, ctx.nuevo, ctx.registro */ },
  detalle:  function (ctx) { /* ctx.registro, ctx.root */ },

  // Último filtro antes de encolar; devolver false cancela el guardado
  antesDeGuardar: function (ctx) { ctx.datos.Total = String(ctx.hijos.length); return true; }
};
```

Ejemplos vivos: el tablero de cobertura de `10_Charlas`, la matriz de riesgo
de `07_IPERC`, la vigencia y la lista de controles de `08_PETAR`.

**Último recurso:** si una vista necesita una estructura que no cabe en
`Vistas` ni en un gancho, crear `Mod_XX_Nombre_Vista.html` con
`id="module-xx_nombre-vista"` y registrarlo en `Index.html`. El router la
prefiere sobre el motor. Hoy solo lo usan `01_Usuarios` (crea cuentas por
`/api/usuarios`, no por la cola) y `00_Admin`.

## Reglas que siguen vigentes

- Todo dato pintado como HTML pasa por `esc()`; nunca interpolar datos en
  `onclick` (usar `data-*` + `this.dataset`). Vale también dentro de los ganchos.
- Colores solo con los tokens `--st-*` y `--ds-*`: nunca hex crudos, y deben
  verse bien en claro y en oscuro.
- **Todo input de DNI acepta máximo 8 caracteres** (`maxlength="8"`,
  `inputmode="numeric"`), sea el login, un formulario o una fila hija. El motor
  lo aplica solo (`attrsDNI()` en `Global_Config.js.html`) a todo campo `Text`
  cuyo nombre contenga `DNI` como palabra (`DNI`, `Trabajador_DNI`) o cuya
  etiqueta mencione "DNI"; nombra así los campos para que lo reciban. En un
  `<input>` escrito a mano (vistas propias como `01_Usuarios`) hay que
  ponerlo explícitamente. El DNI sigue siendo tipo `Text`, nunca `Number`.
- **Cada casilla acepta solo lo suyo.** Un campo que guarda una cantidad se
  declara `control: "number"` con `min`/`max`/`step` (días, horas, personas,
  notas, importes); correo `email`, teléfono `tel`, y `maxLength` en los
  textos con tope. El motor también lo deduce del nombre, pero eso es una red
  de seguridad, no la regla: lo que no se declara acaba aceptando letras donde
  debía haber un número. Mismas claves en `Relational_Fields`. Al guardar se
  revisa el formulario con `checkValidity()` y no se encola nada mal puesto.
  Tabla completa en `references/renderizador.md`.
- **Las listas se escriben, no se recorren.** Todo campo `REF` lleva buscador
  **siempre** (hoy tiene ocho nombres; el año que viene, doscientos) y todo
  `Enum` lo recibe a partir de 9 opciones: se teclea y la lista se filtra, sin
  distinguir mayúsculas ni tildes. Vale también para los `select` de una fila
  hija y para los del panel de filtros. Se monta solo —no hay nada que invocar
  ni que duplicar por módulo—; `buscador: true` en una variable lo fuerza en un
  `Enum` corto y `data-sin-buscador` lo quita. Detalle en la skill
  `motor-pwa-design` («Listas largas: se escriben, no se recorren»).
- Nunca editar a mano `LOCAL_PREVIEW.html`, `PROD_INDEX.html` ni `dist/`.
- Cambiar la matriz de roles cambia la seguridad real: regenerar el SQL y
  volver a aplicar `supabase_02_rls.sql`.

## Antes de dar por terminado

```bash
node generate_preview.js    # LOCAL_PREVIEW.html + PROD_INDEX.html
npm test                    # RLS + Apps Script + vistas generadas (jsdom)
```

`npm run test:render` carga el bundle real en un DOM y recorre las tres vistas
de cada módulo: comprueba que se dibujan, que el formulario carga y guarda,
que el detalle trae sus filas hijas y que nada se escapa sin escapar.
