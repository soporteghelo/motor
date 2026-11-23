---
name: motor-pwa-recorrido
description: Recorrido guiado (visita interactiva) para la primera vez que un trabajador o supervisor entra a MOTOR PWA en un navegador o dispositivo: abre uno por uno los módulos que su rol puede ver, oscurece la pantalla y resalta un elemento a la vez explicando cómo se usa. Úsala para construirlo, agregar, editar, reordenar o quitar pasos, anclar elementos con data-tour, hacer que entre a otro módulo, cambiar cuándo se muestra, o probarlo y reiniciarlo.
---

# Recorrido guiado de MOTOR PWA

Visita guiada sobre la app real: **entra a cada módulo**, oscurece la pantalla,
resalta un elemento a la vez y explica cómo se usa. La persona avanza tocando
**Siguiente**; mientras tanto no puede tocar la app.

> **Estado: no implementado todavía.** MOTOR no tiene recorrido guiado. Esta
> skill es la especificación para construirlo y, después, para mantenerlo. El
> diseño viene de la implementación que ya funciona en LearnDrive
> (`PLATAFORMA_ELEARNING`), traducida a la arquitectura de MOTOR: JS nativo,
> `MOTOR_RENDER` y `PERMISOS`, sin React. Al construirlo, actualiza esta tabla
> de archivos con lo que realmente exista.

## Dónde va el código

| Archivo | Rol |
|---|---|
| `00_Config/Recorrido.js.html` | Todo el recorrido: pasos, motor de resaltado, tarjeta y estado. Un archivo nuevo. |
| `00_Config/Index.html` | Una línea `<?!= include('Recorrido.js'); ?>` **después** de `App_Routing.js` (necesita `showView` y `PERMISOS` ya cargados), y un bloque de CSS `RECORRIDO GUIADO` en la zona de estilos. |

Dentro de `Recorrido.js.html`, separa estas tres partes: **`RECORRIDO.pasos`**
(contenido y orden, lo que se edita el 90 % de las veces), el **motor**
(resaltado, tarjeta, bloqueo, navegación entre vistas) y el **estado** (cuándo
se muestra, cuándo se marca como visto).

## Reglas que no se rompen

1. **Solo visita lo que el rol puede ver.** Antes de armar los pasos, filtra con
   `PERMISOS.moduloVisible(modulo)`. Un módulo fuera del plan de la empresa, u
   oculto por el Admin para ese rol, **no** entra en el recorrido: si el paso lo
   abriera, la persona vería un bloqueo en medio de la bienvenida. Deriva la
   lista de `PERMISOS.modulos()`, nunca la escribas a mano.
2. **No para el Admin ni el SuperAdmin.** El recorrido es para Trabajador y
   Supervisor, que son quienes entran de campo. Comprueba con `PERMISOS.rol()`.
3. **Avance solo con el botón.** Una capa transparente sobre toda la pantalla
   bloquea la app durante el recorrido, para que nadie se pierda a mitad.
4. **La tarjeta nunca tapa lo que explica.** Colócala del lado con más aire del
   elemento resaltado, o anclada abajo en los pasos de pantalla completa; si no
   cabe, desplaza solo su texto, no la página. Un botón de «ver la pantalla» la
   encoge a una pastilla.
5. **Enseñar sin ensuciar datos.** Visitar un módulo no debe crear registros ni
   encolar nada. El recorrido **nunca** entra a una vista `Edicion` con intención
   de guardar, ni abre la cámara, ni toca `PWA_SKILLS.triggerGlobalSync()`. Si un
   paso necesita mostrar el formulario, lo muestra y sale sin guardar.
6. **Una sola vez por navegador y por persona.** Al terminar o al omitir se
   guarda la marca en `localStorage`, con clave por DNI
   (`pwa_recorrido_v1_<DNI>`). Desde otro celular, PC o navegador vuelve a
   mostrarse una vez: es intencional, ahí la persona no lo ha visto.
7. **Se puede omitir siempre.** «Omitir recorrido», la ✕ y `Esc` cierran y
   marcan como visto. Al cerrarse, devuelve a la persona al menú.
8. **Respeta `prefers-reduced-motion`**: sin animación de desplazamiento ni de
   resaltado cuando esté activo.

## Orden de los pasos

El orden lo fija el área usuaria, no el programador. El patrón que funcionó en
LearnDrive: **empezar por la acción más importante** (ahí era el video tutorial
de llenado del Anexo 05), **recorrer los módulos** entrando a cada uno, y
**terminar en el módulo donde la persona consulta sus documentos**.

Para MOTOR, el orden natural para un trabajador es: menú → reportar un acto o
condición (lo que más va a usar) → sus capacitaciones y charlas → sus EPP →
cómo sincronizar cuando recupere señal. Confírmalo con el área usuaria antes de
escribirlo.

## Cómo anclar un elemento

Pon `data-tour="mi-elemento"` en el HTML o en la plantilla que lo genera, y en
el paso usa `objetivo: '[data-tour="mi-elemento"]'`.

- Para un elemento de una vista generada por el motor, el ancla va en
  `MOTOR_RENDER` (los ids generados son estables: `resumen-xx`, `edicion-xx`;
  ver `motor-pwa-builder`).
- **Nunca ancles a una clase de Tailwind ni a un selector de posición**
  (`.flex > div:nth-child(3)`): se rompen al primer cambio de diseño.
- Cada paso declara en qué vista vive. Antes de resaltar, el recorrido llama a
  `showView(modulo)` o `changeInternalView(modulo, 'Resumen')` y **espera a que
  el elemento exista** (un `MutationObserver` o un reintento corto), porque las
  vistas se pintan con datos que llegan por red o de IndexedDB.

## Tareas frecuentes

- **Agregar o editar un paso** → `RECORRIDO.pasos` en `00_Config/Recorrido.js.html`.
- **Resaltar un elemento nuevo** → `data-tour="…"` donde se genera + un paso con
  su `objetivo` y su vista.
- **Hacer que entre a otro módulo** → añade el paso con el nombre interno del
  módulo (`07_IPERC`) y comprueba que pasa el filtro de `moduloVisible`.
- **Volver a mostrarlo a todos** → sube la versión de la clave
  (`pwa_recorrido_v2_<DNI>`).
- **Probarlo otra vez en tu navegador** →
  `localStorage.removeItem('pwa_recorrido_v1_<DNI>')` y recarga.

## Antes de dar por terminado

- `node generate_preview.js` y probar con `npm run preview` **en 390 px**, que es
  donde la tarjeta tapa cosas.
- Recorrerlo entero con los cuatro roles: el Trabajador y el Supervisor lo ven;
  el Admin y el SuperAdmin, no.
- Recorrerlo con una empresa que tenga **módulos fuera del plan**, para
  comprobar que esos pasos se omiten solos.
- Comprobar que al terminar no quedó ningún registro nuevo ni nada en la cola
  offline.
