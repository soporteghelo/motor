/**
 * tools/vendor_cdn.js
 * =========================================================================
 * Descarga a web/vendor/ las librerías que la app cargaba de un CDN, para
 * que la app instalada NO necesite internet para pintarse.
 *
 *   npm run vendor        descarga lo que falte
 *   npm run vendor -- -f  vuelve a descargar todo
 *
 * POR QUÉ
 *   Dentro del APK no hay service worker (lo serviría caché vieja después de
 *   aplicar un bundle OTA). Sin él, un Tailwind que viene de internet deja la
 *   app sin estilos y con los iconos como texto la primera vez que alguien la
 *   abre sin señal — justo el caso de un trabajador que baja a interior mina.
 *
 * QUÉ **NO** SE EMPAQUETA
 *   El modelo de detección facial de MediaPipe (cdn.jsdelivr.net): son varios
 *   MB y Face_Capture ya degrada solo a "Usa la cámara del teléfono" cuando
 *   no puede cargarlo.
 *
 * CÓMO ENTRA EN EL BUILD
 *   00_Config/Index.html sigue apuntando al CDN: así PROD_INDEX.html (Apps
 *   Script) funciona, porque allí no hay archivos sueltos que servir.
 *   build_web.js reescribe esas URLs a /vendor/… solo en dist/, que es lo que
 *   va a Vercel y al APK.
 *
 * Los archivos descargados SÍ se versionan: son parte del build reproducible
 * y sin ellos la app no se puede compilar sin conexión.
 * =========================================================================
 */
const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'web', 'vendor');
const FUENTES = path.join(VENDOR, 'fonts');

const forzar = process.argv.includes('-f') || process.argv.includes('--force');

// Google Fonts entrega woff2 (ligero) solo a navegadores modernos; a un
// cliente desconocido le da truetype, que pesa el triple. Se declara un
// navegador genérico, sin ningún dato del usuario ni de su proyecto.
const UA_MODERNO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Versiones FIJAS. Nunca "latest": el build debe dar lo mismo hoy y en un año,
 * y una librería que cambia sola es una vía de entrada de código ajeno.
 */
const SCRIPTS = [
  {
    nombre: 'tailwind.js',
    url: 'https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,container-queries',
    nota: 'Tailwind Play CDN. Compila las clases en el navegador, también sin red.'
  },
  {
    nombre: 'xlsx.full.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    nota: 'SheetJS 0.18.5 — PWA_SKILLS.exportToExcel'
  },
  {
    nombre: 'html2pdf.bundle.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    nota: 'html2pdf 0.10.1 (html2canvas + jsPDF) — el archivo PDF de cada ' +
          'registro y la constancia de consentimiento. NO puede venir de un ' +
          'CDN: la CSP solo permite script-src del propio origen (+ jsdelivr ' +
          'para MediaPipe), así que en dist/ y en el APK se carga de aquí.'
  }
];

/**
 * La fuente de iconos COMPLETA pesa 3,9 MB: iría en el APK y, peor, en cada
 * bundle OTA que los teléfonos bajan con la señal de la mina. Google Fonts
 * permite pedir solo los iconos usados (`icon_names`), y eso la deja en unas
 * decenas de KB.
 *
 * La lista se saca del código, no se escribe a mano: así no se queda vieja.
 * Los nombres que no existan se ignoran (Google responde 200 igual), de modo
 * que la extracción peca de generosa a propósito: un icono de más cuesta unos
 * cientos de bytes, uno de menos se ve como texto en la pantalla.
 *
 * Si añades un icono nuevo, `npm run test:ota` falla hasta que ejecutes
 * `npm run vendor -- -f`.
 */
function iconosUsados(raiz) {
  const SALTAR = ['node_modules', '.git', 'dist', 'android', 'ios', '.apk', '.ota', '.playwright-mcp', 'web'];
  const encontrados = new Set();
  const visitar = d => {
    for (const n of fs.readdirSync(d)) {
      if (SALTAR.includes(n)) continue;
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { visitar(p); continue; }
      if (!/\.(html|js|gs)$/.test(n) || /^(PROD_INDEX|LOCAL_PREVIEW)/.test(n)) continue;
      const texto = fs.readFileSync(p, 'utf8');
      // 1. <span class="material-symbols-outlined">nombre</span>
      for (const m of texto.matchAll(/material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]{1,40})\s*</g)) {
        encontrados.add(m[1]);
      }
      // 2. Cualquier literal con forma de icono en una línea que hable de
      //    iconos: cubre Card_Icon, icono:, || 'x', ternarios y arrays.
      //    El segundo patrón son las variables tipo `saludoIco` / `avisoIco`:
      //    no contienen "icon", y la I mayúscula las distingue de cualquier
      //    palabra española acabada en "ico" (único, gráfico, técnico…).
      texto.split(/\r?\n/).forEach(linea => {
        // 3. El intercambio de glifo de un icono dinámico SIEMPRE es
        //    elemento.innerText/textContent = 'nombre': no depende de que la
        //    variable se llame "icon" o "xIco" (ico, eye, flecha… también
        //    cambian el ojo tachado, la flecha o el candado).
        if (/\.(innerText|textContent)\s*=\s*['"][a-z][a-z0-9_]{1,40}['"]/.test(linea)) {
          for (const m of linea.matchAll(/\.(?:innerText|textContent)\s*=\s*['"]([a-z][a-z0-9_]{1,40})['"]/g)) encontrados.add(m[1]);
          return;
        }
        if (!/icon/i.test(linea) && !/[a-z]Ico\b/.test(linea)) return;
        for (const m of linea.matchAll(/['"]([a-z][a-z0-9_]{1,40})['"]/g)) encontrados.add(m[1]);
      });
    }
  };
  visitar(raiz);
  return [...encontrados].sort();
}

const ICONOS = iconosUsados(ROOT);

const FAMILIAS = [
  { archivo: 'archivo.css',  url: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap' },
  { archivo: 'simbolos.css', url: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=' + ICONOS.join(',') }
];

const kb = n => (n / 1024).toFixed(0) + ' KB';

async function bajar(url, cabeceras) {
  const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA_MODERNO }, cabeceras || {}) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' al bajar ' + url);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  fs.mkdirSync(FUENTES, { recursive: true });
  let bajados = 0, saltados = 0;

  // ── Scripts ─────────────────────────────────────────────────────────────
  for (const s of SCRIPTS) {
    const destino = path.join(VENDOR, s.nombre);
    if (fs.existsSync(destino) && !forzar) {
      console.log('  ↷ ' + s.nombre + ' ya está (' + kb(fs.statSync(destino).size) + ')');
      saltados++;
      continue;
    }
    const buf = await bajar(s.url);
    fs.writeFileSync(destino, buf);
    console.log('  ✔ ' + s.nombre + '  ' + kb(buf.length));
    bajados++;
  }

  // ── Fuentes: el CSS y, dentro, cada .woff2 ──────────────────────────────
  for (const f of FAMILIAS) {
    const destinoCss = path.join(VENDOR, f.archivo);
    if (fs.existsSync(destinoCss) && !forzar) {
      console.log('  ↷ ' + f.archivo + ' ya está');
      saltados++;
      continue;
    }
    let css = (await bajar(f.url, { Accept: 'text/css,*/*;q=0.1' })).toString('utf8');
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
    if (!urls.length) throw new Error('El CSS de ' + f.archivo + ' no trae ninguna fuente.');

    for (const u of urls) {
      // Nombre corto y estable: la misma URL da siempre el mismo archivo, y
      // no se hereda la ruta de Google, que con subconjunto de iconos pasa de
      // los 260 caracteres que admite Windows.
      const base = f.archivo.replace(/\.css$/, '') + '-' +
                   require('crypto').createHash('sha1').update(u).digest('hex').slice(0, 10) + '.woff2';
      const destino = path.join(FUENTES, base);
      if (!fs.existsSync(destino) || forzar) {
        fs.writeFileSync(destino, await bajar(u));
      }
      css = css.split(u).join('fonts/' + base);
    }
    fs.writeFileSync(destinoCss, css);
    console.log('  ✔ ' + f.archivo + '  (' + urls.length + ' archivos de fuente)');
    bajados++;
  }

  // La lista de iconos queda escrita: la revisa npm run test:ota para avisar
  // cuando alguien añade un icono y no vuelve a empaquetar las fuentes.
  fs.writeFileSync(path.join(VENDOR, 'iconos.txt'), ICONOS.join('\n') + '\n');
  console.log('  ✔ iconos.txt  (' + ICONOS.length + ' iconos en el subconjunto)');

  // ── Resumen ─────────────────────────────────────────────────────────────
  const pesa = d => fs.readdirSync(d).reduce((t, n) => {
    const p = path.join(d, n);
    return t + (fs.statSync(p).isDirectory() ? pesa(p) : fs.statSync(p).size);
  }, 0);
  console.log('\n  web/vendor/  ' + kb(pesa(VENDOR)) + ' en total' +
              (bajados ? '  (' + bajados + ' descargados, ' + saltados + ' ya estaban)' : ''));
  if (!bajados) console.log('  Nada que hacer. Para rehacerlo: npm run vendor -- -f');
})().catch(e => {
  console.error('❌ ' + e.message);
  process.exit(1);
});
