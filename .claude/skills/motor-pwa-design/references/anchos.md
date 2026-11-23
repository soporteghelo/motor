# Verificar que nada se salga de la pantalla

Dos comprobaciones que se complementan. La primera encuentra la causa en el CSS
sin abrir el navegador; la segunda confirma el resultado en pantallas reales.

Ejecútalas siempre que toques una barra de filtros, una fila de acciones, una
rejilla de campos o una tarjeta móvil.

## 1. Auditoría estática: rejillas con ancho mínimo fijo

Una `grid-template-columns` con un número fijo de columnas y mínimos en píxeles
exige un ancho que no negocia: si el contenedor es menor, la rejilla se sale.
`repeat(7, minmax(110px, 1fr))` pide 770px más las separaciones pase lo que
pase, así que en móvil el último control queda fuera.

Este guion suma el mínimo de cada plantilla y avisa de las que piden demasiado.
En MOTOR el CSS vive dentro de los `.html`, así que recorre los archivos fuente
—nunca los bundles— y detecta también las rejillas escritas en un atributo
`style="…"` o dentro de una plantilla de JS.

Guárdalo como `tools/audit_anchos.py` o pégalo en una terminal **desde la raíz
del proyecto**:

```bash
python - <<'PY'
# coding: utf-8
import io, re, glob, os
GTC = re.compile(r'grid-template-columns\s*:\s*([^;"}\n]+)')
REP = re.compile(r'repeat\(\s*(\d+)\s*,\s*([^()]*(?:\([^()]*\))?[^()]*)\)')
MM  = re.compile(r'minmax\(\s*([^,]+),')
GAP = re.compile(r'gap\s*:\s*(\d+)px')

def need(value, gap):
    v = value.strip()
    if 'auto-fit' in v or 'auto-fill' in v:
        return None                                  # elastica: nunca desborda
    holder = {}
    def keep(m):
        k = '@@%d@@' % len(holder); holder[k] = m.group(0); return k
    safe = re.sub(r'minmax\([^()]*\)', keep, v)
    out, pos = [], 0
    for m in REP.finditer(safe):
        out.extend(safe[pos:m.start()].split())
        out.extend([m.group(2).strip()] * int(m.group(1)))
        pos = m.end()
    out.extend(safe[pos:].split())
    tracks = [t for t in out if t]
    total = 0.0
    for p in tracks:
        p = holder.get(p, p); m = MM.match(p)
        if m:
            a = m.group(1).strip()
            if a.endswith('px'): total += float(a[:-2])
        elif p.endswith('px'):
            try: total += float(p[:-2])
            except ValueError: pass
    return total + max(len(tracks) - 1, 0) * gap

PAT = ('00_Config/*.html', '00_Config/*/*.html', '*/Mod_*.html', '*/subconfig_*.js.html')
ARCH = sorted({p for x in PAT for p in glob.glob(x)
               if os.path.basename(p) not in ('PROD_INDEX.html', 'LOCAL_PREVIEW.html')})

print('archivos revisados:', len(ARCH))
hallazgos = 0
for path in ARCH:
    txt = io.open(path, encoding='utf-8').read()
    for m in GTC.finditer(txt):
        ventana = txt[max(0, m.start() - 300):m.end() + 300]
        g = GAP.search(ventana)
        n = need(m.group(1), int(g.group(1)) if g else 10)
        if n and n >= 600:
            print('%4dpx  %s:%d  %s' % (n, path, txt.count('\n', 0, m.start()) + 1,
                                        m.group(1).strip()[:60]))
            hallazgos += 1
print('rejillas que piden >=600px:', hallazgos)

for path in ARCH:
    txt = io.open(path, encoding='utf-8').read()
    for m in re.finditer(r'width\s*:\s*max-content', txt):
        v = txt[max(0, m.start() - 200):m.end() + 200]
        if 'max-width' not in v:
            print('max-content sin max-width  %s:%d' % (path, txt.count('\n', 0, m.start()) + 1))
PY
```

**Cómo leer el resultado.** El umbral de 600px es el ancho útil por debajo del
corte móvil de MOTOR (639/640px). Todo lo que aparezca por encima se sale en
móvil o en tablet, salvo que viva dentro de un contenedor con `overflow-x:auto`.

La entrega es correcta cuando imprime `rejillas que piden >=600px: 0` y ninguna
línea de `max-content sin max-width`.

Busca además, a ojo, `min-width` en píxeles sobre campos que ya llevan
`width:100%`: ese mínimo es justo lo que desborda la columna estrecha.

## 2. Comprobación en el navegador

Levanta la app con `npm run preview` y abre `http://localhost:3005`. Pega esta
función en la consola y ejecútala **en cada ancho**: 390, 430, 480, 600, 640,
768, 1024 y 1440.

```js
window.__check = () => {
  const out = [];
  const isScroller = (el) => /auto|scroll|hidden/.test(getComputedStyle(el).overflowX);
  document.querySelectorAll('body *').forEach((el) => {
    if (el.tagName === 'OPTION') return;            // no se maquetan
    const p = el.parentElement;
    if (!p || isScroller(p)) return;                // desplazamiento intencional
    const er = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (!er.width && !er.height) return;            // oculto en este ancho
    const over = Math.round(Math.max(er.right - pr.right, pr.left - er.left));
    if (over > 1) out.push({ el: (el.className || el.tagName).toString().slice(0, 40), px: over });
  });
  const doc = document.documentElement;
  return { vw: innerWidth, scrollX: doc.scrollWidth - doc.clientWidth,
           total: out.length, desbordes: out.slice(0, 10) };
};
__check();
```

Recórrelo con **datos largos reales**, no con los de ejemplo cortos: un nombre
de área de 40 caracteres o una descripción sin espacios revelan desbordes que
los datos de prueba esconden. `tools/seed_demo_data.js` siembra registros
completos para esto.

Hazlo en las tres vistas del módulo (Resumen, Edición, Detalle) y con el panel
de filtros abierto, que es donde más aparece.

La entrega es correcta cuando en **todos** los anchos devuelve `total: 0` y
`scrollX: 0`.
