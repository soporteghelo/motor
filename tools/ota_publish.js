/**
 * tools/ota_publish.js
 * =========================================================================
 * Publica el dist/ actual como actualización por aire (OTA) de la app
 * instalada en Android/iOS. El APK no se reinstala.
 *
 *   npm run build            # genera dist/ (y dist/ota-version.json)
 *   npm run ota:publish      # empaqueta, sube y mueve latest.json
 *   npm run deploy           # las dos de una vez
 *
 * DÓNDE SE ALOJA
 *   En los archivos adjuntos de una publicación FIJA del repositorio de
 *   GitHub (etiqueta `ota`). Es gratis, sirve el binario tal cual y no
 *   engorda el historial de git como lo haría subir el zip al repositorio.
 *
 *     releases/download/ota/latest.json          qué versión es la vigente
 *     releases/download/ota/bundle-<versión>.zip el dist/ comprimido
 *
 *   El repositorio tiene que ser PÚBLICO: el teléfono descarga sin iniciar
 *   sesión. Los adjuntos de un repositorio privado piden autenticación y el
 *   plugin no la tiene.
 *
 *   Con --supabase se usa en su lugar un bucket de Supabase Storage.
 *
 * REQUISITOS
 *   GitHub:   gh CLI autenticado (`gh auth login`) o GH_TOKEN en el entorno.
 *   Supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.
 *
 *   Subir aquí es ejecutar código en los teléfonos de la empresa: por eso
 *   hace falta una credencial de escritura, nunca una clave pública.
 *
 * OPCIONES
 *   --dry-run            empaqueta y calcula el hash, no sube nada
 *   --supabase           publica en Supabase Storage en vez de GitHub
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
const { execFileSync } = require('child_process');
const { zipCarpeta } = require('./ota_zip');

const ROOT   = path.join(__dirname, '..');
const DIST   = path.join(ROOT, 'dist');
const SALIDA = path.join(ROOT, '.ota');
const BUCKET = 'actualizaciones';
const ETIQUETA = 'ota';          // publicación fija que hace de almacén

// ── .env local (en CI las variables ya vienen en process.env) ──────────────
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const args    = process.argv.slice(2);
const seco    = args.includes('--dry-run');
const aSupabase = args.includes('--supabase');
const opcion  = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : ''; };
const minNativa = opcion('min-nativa') || '1.0.0';
const notas     = opcion('notas');

const morir = (msg, ayuda) => { console.error('❌ ' + msg); if (ayuda) console.error('\n' + ayuda); process.exit(1); };
const kb = n => (n / 1024).toFixed(0) + ' KB';

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

console.log('📦 ' + nombreZip);
console.log('   version   ' + version);
console.log('   archivos  ' + info.archivos);
console.log('   tamaño    ' + kb(info.bytes));
console.log('   sha256    ' + sha256);

// ── 3. A dónde se sube ─────────────────────────────────────────────────────
/** owner/repo del remoto `origin`, para construir las URL de descarga. */
function repoGitHub() {
  if (process.env.OTA_GITHUB_REPO) return process.env.OTA_GITHUB_REPO.trim();
  let remoto = '';
  try { remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (e) { return ''; }
  const m = remoto.match(/github\.com[/:]([^/]+\/[^/.]+)(\.git)?$/i);
  return m ? m[1] : '';
}

function urlSupabase() {
  const deEntorno = String(process.env.SUPABASE_URL || '').trim();
  if (deEntorno) return deEntorno.replace(/\/+$/, '');
  try {
    const cfg = fs.readFileSync(path.join(ROOT, '00_Config', 'Global_Config.js.html'), 'utf8');
    const m = cfg.match(/URL:\s*'(https:\/\/[a-z0-9]+\.supabase\.co)'/i);
    if (m) return m[1];
  } catch (e) { /* se reporta abajo */ }
  return '';
}

const repo = aSupabase ? '' : repoGitHub();
if (!aSupabase && !repo) {
  morir('No pude deducir el repositorio de GitHub del remoto `origin`.',
        'Define OTA_GITHUB_REPO=usuario/repo en .env, o usa --supabase.');
}

const base = aSupabase
  ? urlSupabase() + '/storage/v1/object/public/' + BUCKET
  : 'https://github.com/' + repo + '/releases/download/' + ETIQUETA;

const latest = {
  version:   version,
  url:       base + (aSupabase ? '/bundles/' : '/') + nombreZip,
  sha256:    sha256,
  bytes:     info.bytes,
  archivos:  info.archivos,
  minNativa: minNativa,
  publicado: new Date().toISOString()
};
if (notas) latest.notas = notas;

const rutaLatest = path.join(SALIDA, 'latest.json');
fs.writeFileSync(rutaLatest, JSON.stringify(latest, null, 2));

if (seco) {
  console.log('\n🧪 --dry-run: no se subió nada. latest.json quedaría así:\n');
  console.log(JSON.stringify(latest, null, 2));
  console.log('\n   Destino:  ' + base);
  console.log('   Guardado: ' + rutaLatest);
  process.exit(0);
}

// ── 4. Subir ───────────────────────────────────────────────────────────────
/** Ejecuta gh y devuelve su salida; lanza con un mensaje legible si falla. */
function gh(argv, permitirFallo) {
  try {
    return execFileSync('gh', argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (permitirFallo) return null;
    const detalle = (e.stderr || e.stdout || e.message || '').toString().trim().split('\n').slice(0, 4).join('\n   ');
    throw new Error('gh ' + argv.slice(0, 3).join(' ') + ' falló:\n   ' + detalle);
  }
}

async function subirAGitHub() {
  // ¿Está instalado y autenticado?
  if (!gh(['--version'], true)) {
    morir('No encontré el comando `gh` (GitHub CLI).',
          'Instálalo desde https://cli.github.com y ejecuta: gh auth login');
  }
  if (!gh(['auth', 'status'], true)) {
    morir('GitHub CLI no está autenticado.',
          'Ejecuta una vez:  gh auth login\n' +
          'O define GH_TOKEN con un token que pueda escribir en ' + repo + '.');
  }

  // La publicación fija hace de almacén. Se crea la primera vez.
  if (!gh(['release', 'view', ETIQUETA, '--repo', repo], true)) {
    console.log('   + creando la publicación "' + ETIQUETA + '" (solo la primera vez)');
    gh(['release', 'create', ETIQUETA, '--repo', repo, '--title', 'Actualizaciones por aire',
        '--notes', 'Almacén de los paquetes que descarga la app instalada. ' +
                   'No es una versión para personas: la gestiona npm run ota:publish.']);
  }

  // El zip NO se reemplaza: cada versión es inmutable (sin --clobber, si ya
  // existe con el mismo nombre es que el contenido es el mismo, y el hash lo
  // confirma al verificar).
  const yaEsta = (gh(['release', 'view', ETIQUETA, '--repo', repo, '--json', 'assets'], true) || '').includes('"' + nombreZip + '"');
  if (yaEsta) {
    console.log('   ↷ ' + nombreZip + ' ya estaba publicado (mismo contenido, mismo hash)');
  } else {
    gh(['release', 'upload', ETIQUETA, rutaZip, '--repo', repo]);
    console.log('   ✔ ' + nombreZip);
  }

  // latest.json SÍ se reemplaza: es el puntero a la versión vigente.
  gh(['release', 'upload', ETIQUETA, rutaLatest, '--repo', repo, '--clobber']);
  console.log('   ✔ latest.json → ' + version);
}

async function subirASupabase() {
  const SUPABASE_URL = urlSupabase();
  const SERVICE_KEY  = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SUPABASE_URL) morir('Falta SUPABASE_URL (en .env o en el entorno).');
  if (!SERVICE_KEY)  morir('Falta SUPABASE_SERVICE_ROLE_KEY. Subir un bundle no puede hacerse con la anon key.');
  let rol = '';
  try { rol = JSON.parse(Buffer.from(SERVICE_KEY.split('.')[1] || '', 'base64').toString()).role || ''; } catch (e) {}
  if (rol && rol !== 'service_role') {
    morir('SUPABASE_SERVICE_ROLE_KEY tiene rol "' + rol + '", no service_role.');
  }

  const subir = async (ruta, cuerpo, tipo, sobrescribir) => {
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
  };

  try {
    await subir('bundles/' + nombreZip, bytes, 'application/zip', false);
    console.log('   ✔ bundles/' + nombreZip);
  } catch (e) {
    if (/Duplicate|already exists|409/i.test(e.message)) console.log('   ↷ ' + nombreZip + ' ya existía');
    else throw e;
  }
  await subir('latest.json', JSON.stringify(latest, null, 2), 'application/json', true);
  console.log('   ✔ latest.json → ' + version);
}

// ── 5. Verificar lo que de verdad quedó publicado ──────────────────────────
async function verificar() {
  console.log('\n🔍 Verificando desde la URL pública…');
  const rl = await fetch(base + '/latest.json?t=' + Date.now(), { cache: 'no-store', redirect: 'follow' });
  if (!rl.ok) {
    throw new Error('latest.json no es accesible públicamente (HTTP ' + rl.status + ').' +
      (aSupabase ? ' ¿Creaste el bucket con tools/supabase_09_ota.sql?'
                 : ' ¿El repositorio ' + repo + ' es público?'));
  }
  const publicado = await rl.json();
  if (publicado.version !== version) {
    throw new Error('latest.json publicado dice "' + publicado.version + '" y esperábamos "' + version + '".');
  }
  const rz = await fetch(publicado.url, { redirect: 'follow' });
  if (!rz.ok) throw new Error('El zip no se puede descargar (HTTP ' + rz.status + ').');
  const descargado = Buffer.from(await rz.arrayBuffer());
  const hashReal = crypto.createHash('sha256').update(descargado).digest('hex');
  if (hashReal !== sha256) {
    throw new Error('El zip publicado NO coincide con el local.\n   esperado: ' + sha256 + '\n   servido:  ' + hashReal);
  }
  console.log('   ✔ latest.json legible y zip íntegro (' + kb(descargado.length) + ')');
}

(async () => {
  try {
    console.log('\n⬆️  Subiendo a ' + (aSupabase ? 'Supabase Storage' : 'GitHub · ' + repo + ' (publicación "' + ETIQUETA + '")') + ' …');
    if (aSupabase) await subirASupabase(); else await subirAGitHub();
    await verificar();
    console.log('\n✅ Publicado. Los dispositivos con señal lo descargarán y lo aplicarán al reabrir la app.');
    if (minNativa !== '1.0.0') {
      console.log('⚠️  minNativa = ' + minNativa + ': los APK anteriores NO lo aplicarán y pedirán reinstalar.');
    }
  } catch (e) {
    morir(e.message);
  }
})();
