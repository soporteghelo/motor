/**
 * build_web.js
 * =========================================================================
 * Genera la versión web (Vercel) de la PWA en dist/:
 *
 *   npm run build        (lo ejecuta Vercel en cada despliegue)
 *
 * A diferencia de generate_preview.js (preview local con mock + bundle para
 * pegar en Apps Script), aquí:
 *   - se resuelven los <?!= include() ?> igual que en GAS
 *   - se eliminan las etiquetas de plantilla de Apps Script (<?= ... ?>)
 *   - NO se inyecta el mock de google.script.run: la app habla con el backend
 *     real (Supabase o Apps Script, según DB_PROVIDER)
 *   - se inyecta window.__MOTOR_ENV__ con DB_PROVIDER, SUPABASE_URL,
 *     SUPABASE_ANON_KEY y APPS_SCRIPT_URL tomados de las variables de entorno
 *     (Vercel → Settings → Environment)
 *   - se añade manifest, iconos y service worker (instalable + offline)
 *
 * La service_role key NUNCA se inyecta aquí: solo la usa api/usuarios.js
 * en el servidor.
 * =========================================================================
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const WEB  = path.join(ROOT, 'web');

// .env local opcional (en Vercel las variables ya vienen en process.env)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

// ── 1. Resolver includes (misma búsqueda que generate_preview.js) ──────────
const includeRegex = /<\?!= include\(['"]([^'"]+)['"]\);? \?>/g;
const resolver = (filename) => {
  const check = p => fs.existsSync(p) ? p : (fs.existsSync(p + '.html') ? p + '.html' : null);
  return check(path.join(ROOT, filename)) || check(path.join(ROOT, '00_Config', filename));
};

let html = fs.readFileSync(path.join(ROOT, '00_Config', 'Index.html'), 'utf8');
const faltantes = [];
html = html.replace(includeRegex, (m, filename) => {
  const p = resolver(filename);
  if (!p) { faltantes.push(filename); return ''; }
  return fs.readFileSync(p, 'utf8');
});
if (faltantes.length) {
  console.error('❌ Includes no encontrados:\n  ' + faltantes.join('\n  '));
  process.exit(1);
}

// ── 2. Quitar plantillas de Apps Script ────────────────────────────────────
html = html.replace(/<\?=\s*scriptUrl\s*\?>/g, '');
const restos = html.match(/<\?[=!][\s\S]*?\?>/g);
if (restos) {
  console.error('❌ Quedan etiquetas de Apps Script sin resolver:\n  ' + restos.slice(0, 5).join('\n  '));
  process.exit(1);
}
// <base target="_top"> solo tiene sentido dentro del iframe de Apps Script
html = html.replace(/<base target="_top">\s*/i, '');
if (!/<html[^>]*\blang=/i.test(html)) html = html.replace(/<html/i, '<html lang="es"');

// ── 3. Variables de entorno públicas ───────────────────────────────────────
// DB_PROVIDER elige la base de datos de este despliegue: supabase | appscript
const proveedor = String(process.env.DB_PROVIDER || '').trim().toLowerCase();
if (proveedor && ['supabase', 'appscript', 'sheets'].indexOf(proveedor) === -1) {
  console.error('❌ DB_PROVIDER inválido: "' + proveedor + '" (usa supabase o appscript).');
  process.exit(1);
}
const env = {
  DB_PROVIDER:       proveedor === 'sheets' ? 'appscript' : proveedor,
  SUPABASE_URL:      process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  APPS_SCRIPT_URL:   String(process.env.APPS_SCRIPT_URL || '').trim(),
  APP_VERSION:       process.env.APP_VERSION || '',
  // Base del OTA. Si se deja vacía, OTA_Updater la deduce de SUPABASE_URL.
  OTA_URL:           String(process.env.OTA_URL || '').trim()
};
if (env.DB_PROVIDER === 'appscript') {
  if (!env.APPS_SCRIPT_URL) {
    console.error('❌ DB_PROVIDER=appscript requiere APPS_SCRIPT_URL (la URL /exec de la implementación web de Code.gs).');
    process.exit(1);
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(env.APPS_SCRIPT_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(env.APPS_SCRIPT_URL)) {
    console.warn('⚠️  APPS_SCRIPT_URL no parece una URL /exec de Apps Script: ' + env.APPS_SCRIPT_URL);
  }
} else if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_ANON_KEY no definidas: se usarán las de Global_Config.js.html.');
}
if (/service_role/.test(Buffer.from((env.SUPABASE_ANON_KEY.split('.')[1] || ''), 'base64').toString())) {
  console.error('❌ SUPABASE_ANON_KEY contiene una service_role key. Nunca debe ir al navegador.');
  process.exit(1);
}

const buildId = crypto.createHash('sha1').update(html + JSON.stringify(env)).digest('hex').slice(0, 10);

// Versión de este bundle para la actualización por aire. Se calcula DESPUÉS
// del buildId (que es un hash del html + env) para no morderse la cola.
// Es determinista: el mismo código produce la misma versión y el mismo zip.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
env.OTA_VERSION = pkg.version + '-' + buildId;

const cabeza = `
  <script>window.__MOTOR_ENV__ = ${JSON.stringify(env).replace(/</g, '\\u003c')};</script>
  <meta name="theme-color" content="#1a237e">
  <meta name="description" content="Gestión SSOMA para minería: inspecciones, incidentes, IPERC, PETAR, EPP, capacitaciones y charlas.">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="SSOMA">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="preconnect" href="${env.DB_PROVIDER === 'appscript' ? 'https://script.google.com' : (env.SUPABASE_URL || 'https://supabase.co')}" crossorigin>`;
html = html.replace(/<meta charset="UTF-8">/i, m => m + cabeza);

const registroSW = `
<script>
  // Service worker: instala la app y la abre sin conexión. Los datos NO se
  // cachean aquí (eso es de Offline_Engine/IndexedDB): solo el "cascarón".
  // Dentro de la app empaquetada (Capacitor) el cascarón ya vive en el APK y
  // lo renueva el OTA: un service worker ahí solo serviría caché vieja
  // después de aplicar un bundle nuevo.
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener('statechange', function () {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller && window.PWA_SKILLS) {
              PWA_SKILLS.toast('Hay una nueva versión. Se aplicará al reabrir la app.', 'info', 5000);
            }
          });
        });
      }).catch(function (e) { console.warn('[SW] registro fallido:', e); });
    });
  }
</script>
</body>`;
html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, registroSW);

// ── 4. Escribir dist/ ──────────────────────────────────────────────────────
// Se vacía el contenido (no la carpeta): en Windows no se puede borrar una
// carpeta abierta por otro proceso, p. ej. un servidor local sirviendo dist/.
fs.mkdirSync(DIST, { recursive: true });
fs.readdirSync(DIST).forEach(f => fs.rmSync(path.join(DIST, f), { recursive: true, force: true }));
fs.writeFileSync(path.join(DIST, 'index.html'), html);

const copiar = (src, dst) => {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(f => copiar(path.join(src, f), path.join(dst, f)));
  } else {
    fs.copyFileSync(src, dst);
  }
};
copiar(WEB, DIST);

// La versión del SW cambia con cada build: así el navegador renueva la caché
const swPath = path.join(DIST, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, buildId));

// Marca de versión del bundle: la lee tools/ota_publish.js y queda servida
// en /ota-version.json para poder comprobar qué versión hay desplegada.
// SIN fecha a propósito: si cambiara en cada build, el zip nunca tendría dos
// veces el mismo SHA-256 y la publicación OTA no podría verificarse.
fs.writeFileSync(path.join(DIST, 'ota-version.json'),
  JSON.stringify({ version: env.OTA_VERSION, buildId: buildId }, null, 2) + '\n');

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('✅ dist/ generado (build ' + buildId + ')');
console.log('   index.html  ' + kb(fs.statSync(path.join(DIST, 'index.html')).size));
console.log('   Base datos  ' + (env.DB_PROVIDER || '(Global_Config.js.html)') +
            (env.DB_PROVIDER === 'appscript' ? ' → ' + env.APPS_SCRIPT_URL : ' → ' + (env.SUPABASE_URL || '(Global_Config.js.html)')));
