"""
gen_icons.py — genera todos los iconos de la app desde web/icons/logo-master.png

    python tools/gen_icons.py

El logo maestro (1254x1254, fondo marino plano) es la única fuente. De él salen:
  web/icons/icon-192.png, icon-512.png     iconos de la PWA (apple-touch-icon incluido)
  web/icons/icon-maskable-512.png          con margen: sobrevive a máscaras circulares
  web/icons/icon.svg                       envoltorio SVG (favicon)
  web/icons/logo.png                       256 px, para la pantalla de acceso
  web/icons/android/mipmap-*/              iconos de lanzador (los copia tools/apk_build.js)
Requiere Pillow (pip install pillow). Solo hay que re-ejecutarlo si cambia el logo.
"""
import base64, io, os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
ICONOS = os.path.join(AQUI, '..', 'web', 'icons')
src = Image.open(os.path.join(ICONOS, 'logo-master.png')).convert('RGB')
FONDO = src.getpixel((5, 5))

def guardar(img, ruta):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    img.save(ruta, optimize=True)

def escalar(img, t):
    return img.resize((t, t), Image.LANCZOS)

def con_margen(factor, t):
    """Símbolo reducido sobre el mismo fondo plano (zona segura de máscaras)."""
    lienzo = Image.new('RGB', src.size, FONDO)
    n = int(src.width * factor)
    lienzo.paste(src.resize((n, n), Image.LANCZOS), ((src.width - n) // 2, (src.height - n) // 2))
    return escalar(lienzo, t)

# PWA
guardar(escalar(src, 192), os.path.join(ICONOS, 'icon-192.png'))
guardar(escalar(src, 512), os.path.join(ICONOS, 'icon-512.png'))
guardar(con_margen(0.80, 512), os.path.join(ICONOS, 'icon-maskable-512.png'))
guardar(escalar(src, 256), os.path.join(ICONOS, 'logo.png'))

# SVG (favicon): el PNG de 128 px incrustado; los navegadores lo escalan
b = io.BytesIO(); escalar(src, 128).save(b, 'PNG', optimize=True)
open(os.path.join(ICONOS, 'icon.svg'), 'w', encoding='utf-8').write(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128">'
    '<image width="128" height="128" xlink:href="data:image/png;base64,' + base64.b64encode(b.getvalue()).decode() + '"/></svg>')

# Android: lanzador clásico (48..192 dp) y primer plano del icono adaptable (108..432 px)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in DENS.items():
    base = os.path.join(ICONOS, 'android', 'mipmap-' + d)
    guardar(escalar(src, int(48 * k)), os.path.join(base, 'ic_launcher.png'))
    guardar(escalar(src, int(48 * k)), os.path.join(base, 'ic_launcher_round.png'))
    # primer plano adaptable: el 66 % central es lo que siempre se ve
    guardar(con_margen(0.62, int(108 * k)), os.path.join(base, 'ic_launcher_foreground.png'))

print('Fondo del logo: #%02x%02x%02x' % FONDO)
print('OK: iconos generados en web/icons/')
