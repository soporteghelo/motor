/**
 * tools/ota_publish.js
 * =========================================================================
 * Publica el dist/ actual como actualización por aire (OTA) de la app
 * instalada en Android/iOS.
 *
 *   npm run build            # genera dist/ (y dist/ota-version.json)
 *   npm run ota:publish      # empaqueta, sube y apunta latest.json
 *
 * Qué sube al bucket público "actualizaciones":
 *   bundles/bundle-<version>.zip   el dist/ comprimido (inmutable)
 *   latest.json                    { version, url, sha256, bytes, ... }
 *
 * El cliente (00_Config/OTA_Updater.js.html) lee latest.json, descarga el zip
 * y el plugin comprueba el SHA-256 en nativo antes de aceptarlo.
 *
 * SEGURIDAD
 *   Necesita SUPABASE_SERVICE_ROLE_KEY: subir código que se ejecutará en los
 *   teléfonos no puede quedar al alcance de la anon key. Esa clave vive solo
 *   en tu .env local o en el CI; NUNCA en el navegador ni en el bundle.
 *
 * OPCIONES
 *   --dry-run            empaqueta y calcula el hash, no sube nada
 *   --min-nativa=1.2.0   exige esa versión de APK (para bundles que necesitan
 *                        código nativo nuevo: un plugin, un permiso). Los
 *                        dispositivos con un APK anterior NO lo aplicarán y
 *                        avisarán de que hay que reinstalar.
 *   --notas="texto"      nota corta que queda en latest.json
 * =========================================================================
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { zipCarpeta } = require('./ota_zip');

const ROOT   = path.join(__dirname, '..');
const DIST   = path.join(ROOT, 'dist');
const SALIDA = path.join(ROOT, '.ota');
const BUCKET = 'actualizaciones';

// ── .env local (en CI las variables ya vienen en process.env) ──────────────
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const args     = process.argv.slice(2);
const seco     = args.includes('--dry-run');
const opcion   = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : ''; };
const minNativa = opcion('min-nativa') || '1.0.0';
const notas     = opcion('notas');

const morir = msg => { console.error('❌ ' + msg); process.exit(1); };

/** Payload de un JWT, sin verificar la firma: solo para saber qué rol trae. */
function rolDeClave(clave) {
  try {
    const p = JSON.parse(Buffer.from(String(clave).split('.')[1] || '', 'base64').toString());
    return p.role || '';
  } catch (e) { return ''; }
}

// ── 1. Comprobar el dist/ ──────────────────────────────────────────────────
const marcaPath = path.join(DIST, 'ota-version.json');
if (!fs.existsSync(path.join(DIST, 'index.html'))) morir('No hay dist/index.html. Ejecuta primero: npm run build');
if (!fs.existsSync(marcaPath)) morir('Falta dist/ota-version.json. Vuelve a ejecutar: npm run build');

const marca   = JSON.parse(fs.readFileSync(marcaPath, 'utf8'));
const version = String(marca.version || '').trim();
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) morir('Versión inválida en ota-version.json: "' + version + '"');

// ── 2. Empaquetar (determinista: mismo dist/ → mismo zip → mismo hash) ─────
fs.mkdirSync(SALIDA, { recursive: true });
const nombreZip = 'bundle-' + version + '.zip';
const rutaZip   = path.join(SALIDA, nombreZip);
// Fecha fija dentro del zip: así el hash depende solo del contenido.
const info   = zipCarpeta(DIST, rutaZip, new Date('2020-01-01T00:00:00Z'));
const bytes  = fs.readFileSync(rutaZip);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('📦 ' + nombreZip);
console.log('   version   ' + version);
console.log('   archivos  ' + info.archivos);
console.log('   tamaño    ' + kb(info.bytes));
console.log('   sha256    ' + sha256);

// ── 3. Credenciales ────────────────────────────────────────────────────────
/**
 * La URL del proyecto sale del entorno o, si no está, de Global_Config.js.html
 * (la misma que usa la app cuando se compila sin .env). Así el publicador y el
 * cliente apuntan siempre al mismo sitio.
 */
function urlSupabase() {
  const deEntorno = String(process.env.SUPABASE_URL || '').trim();
  if (deEntorno) return deEntorno.replace(/\/+$/, '');
  try {
    const cfg = fs.readFileSync(path.join(ROOT, '00_Config', 'Global_Config.js.html'), 'utf8');
    const m = cfg.match(/URL:\s*'(https:\/\/[a-z0-9]+\.supabase\.co)'/i);
    if (m) {
      console.log('ℹ️  SUPABASE_URL no definida: se usa la de Global_Config.js.html');
      return m[1];
    }
  } catch (e) { /* se reporta abajo como ausente */ }
  return '';
}

const SUPABASE_URL = urlSupabase();
const SERVICE_KEY  = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const urlPublica = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/bundles/' + nombreZip;
const latest = {
  version:   version,
  url:       urlPublica,
  sha256:    sha256,
  bytes:     info.bytes,
  archivos:  info.archivos,
  minNativa: minNativa,
  publicado: new Date().toISOString()
};
if (notas) latest.notas = notas;

if (seco) {
  console.log('\n🧪 --dry-run: no se subió nada. latest.json quedaría así:\n');
  console.log(JSON.stringify(latest, null, 2));
  fs.writeFileSync(path.join(SALIDA, 'latest.json'), JSON.stringify(latest, null, 2));
  console.log('\n   Guardado local: ' + path.join(SALIDA, 'latest.json'));
  process.exit(0);
}

if (!SUPABASE_URL) morir('Falta SUPABASE_URL (en .env o en el entorno).');
if (!SERVICE_KEY)  morir('Falta SUPABASE_SERVICE_ROLE_KEY. Subir un bundle no puede hacerse con la anon key.');
const rol = rolDeClave(SERVICE_KEY);
if (rol && rol !== 'service_role') {
  morir('SUPABASE_SERVICE_ROLE_KEY tiene rol "' + rol + '", no service_role. Copia la clave correcta (Project Settings → API).');
}

// ── 4. Subir ───────────────────────────────────────────────────────────────
async function subir(ruta, cuerpo, tipo, sobrescribir) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + ruta, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': tipo,
      'cache-control': sobrescribir ? 'no-cache, max-age=0' : 'public, max-age=31536000, immutable',
      'x-upsert': sobrescribir ? 'true' : 'false'
    },
    body: cuerpo
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ' al subir ' + ruta + ' — ' + texto.slice(0, 300));
  }
}

(async () => {
  try {
    console.log('\n⬆️  Subiendo a ' + BUCKET + '/ …');
    try {
      await subir('bundles/' + nombreZip, bytes, 'application/zip', false);
      console.log('   ✔ bundles/' + nombreZip);
    } catch (e) {
      // Un bundle ya subido no se reescribe: si el contenido no cambió, el
      // hash es el mismo y el que está sirve. Si cambió, cambia la versión.
      if (/Duplicate|already exists|409/i.test(e.message)) {
        console.log('   ↷ bundles/' + nombreZip + ' ya existía (mismo contenido, mismo hash)');
      } else { throw e; }
    }

    await subir('latest.json', JSON.stringify(latest, null, 2), 'application/json', true);
    console.log('   ✔ latest.json → ' + version);

    // ── 5. Verificar lo que de verdad quedó publicado ──────────────────────
    console.log('\n🔍 Verificando desde la URL pública…');
    const rl = await fetch(SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!rl.ok) throw new Error('latest.json no es accesible públicamente (HTTP ' + rl.status + '). ¿Creaste el bucket con tools/supabase_09_ota.sql?');
    const publicado = await rl.json();
    if (publicado.version !== version) throw new Error('latest.json publicado dice "' + publicado.version + '" y esperábamos "' + version + '".');

    const rz = await fetch(publicado.url);
    if (!rz.ok) throw new Error('El zip no se puede descargar (HTTP ' + rz.status + ').');
    const descargado = Buffer.from(await rz.arrayBuffer());
    const hashReal = crypto.createHash('sha256').update(descargado).digest('hex');
    if (hashReal !== sha256) {
      throw new Error('El zip publicado NO coincide con el local.\n   esperado: ' + sha256 + '\n   servido:  ' + hashReal);
    }
    console.log('   ✔ latest.json legible y zip íntegro (' + kb(descargado.length) + ')');

    console.log('\n✅ Publicado. Los dispositivos con señal lo descargarán y lo aplicarán al reabrir la app.');
    if (minNativa !== '1.0.0') {
      console.log('⚠️  minNativa = ' + minNativa + ': los APK anteriores NO lo aplicarán y pedirán reinstalar.');
    }
  } catch (e) {
    morir(e.message);
  }
})();
