# Fuente de diseño

Lee `design-system/motor-pwa/MASTER.md` para consultar el sistema «Industrial seguro» completo antes de implementar un cambio visual.

Los tokens relevantes del proyecto están en `00_Config/Index.html`:

- Superficies y texto: `--ds-surface`, `--ds-surface-sunken`, `--ds-fg`, `--ds-fg-muted`, `--ds-border`, `--ds-border-soft`, `--ds-skeleton`, `--ds-scrim`, `--ds-shadow`, `--ds-radius`
- Marca: `--color-primary` (marino), `--brand-accent` / `--brand-accent-strong` (amarillo, solo relleno), `--brand-ink`, `--header-bg`, `--color-bg`, `--color-surface`, `--color-text`
- Estados para distintivos pintados desde JS: `--st-{ok,lime,warn,bad,crit,mute,info}-{bg,fg,bd}`
- Colores Tailwind (`tailwind.config` en el mismo archivo): marino como `primary`; `accent` / `on-accent` para el amarillo

Piezas de código que implementan las reglas:

- Botón amarillo, foco, `.req-star`, `.field-pair`: `Index.html` §8
- Tarjetas móviles sin huecos: `Index.html` §5 y §8.b
- Asteriscos de obligatorios: `PWA_SKILLS.marcarObligatorios` (`Global_Skills.js.html`, Skill 25) + `data-obligatorios` en cada Edición

El sistema de diseño fuente gobierna la densidad de componentes, el comportamiento responsivo, el contraste y el emparejamiento de temas claro/oscuro.
