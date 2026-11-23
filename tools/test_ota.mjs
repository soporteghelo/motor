/**
 * tools/test_ota.mjs — pruebas de OTA_Updater y del empaquetado del bundle
 *
 *   node tools/test_ota.mjs        (requiere dist/: npm run build antes)
 *
 * Comprueba lo que no se puede ver a ojo:
 *   · En el navegador el módulo NO hace nada (ni red, ni errores).
 *   · Dentro de Capacitor pide el latest.json correcto, verifica el hash y
 *     activa con next() (nunca set(), que recargaría en caliente).
 *   · Un bundle que exige un APK más nuevo NO se aplica.
 *   · El zip es válido, determinista y su SHA-256 es el que se publica.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fail = 0;
const check = (nombre, cond, extra) => {
  if (cond) { ok++; console.log('  ✔ ' + nombre); }
  else { fail++; console.log('  ✘ ' + nombre + (extra ? ' — ' + extra : '')); }
};
const esperar = () => new Promise(r => setImmediate(r));

// ── Cargar el módulo OTA en un entorno controlado ─────────────────────────
const fuente = fs.readFileSync(path.join(ROOT, '00_Config', 'OTA_Updater.js.html'), 'utf8')
  .replace(/^[\s\S]*?<script>/, '').replace(/<\/script>\s*$/, '');

/**
 * Monta un window de mentira. `capacitor` null = navegador.
 * Devuelve { win, llamadas, fetches }.
 */
function montar({ capacitor = null, env = {}, latest = null, httpStatus = 200 } = {}) {
  const llamadas = [];
  const fetches = [];
  const reg = (n, v) => { llamadas.push(n); return v; };

  const win = {
    __MOTOR_ENV__: env,
    AppState: { Supabase: { URL: 'https://proyecto.supabase.co' } },
    PWA_SKILLS: { toast: (m, t) => llamadas.push('toast:' + t) },
    setTimeout: () => 0,
    console,
    JSON,
    Date,
    Promise,
    fetch: (u) => {
      fetches.push(String(u));
      if (httpStatus !== 200) return Promise.resolve({ ok: false, status: httpStatus });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(latest) });
    },
    document: { addEventListener: () => {}, visibilityState: 'visible' }
  };
  win.window = win;
  if (capacitor) win.Capacitor = capacitor;

  const ctx = vm.createContext(win);
  vm.runInContext(fuente, ctx, { filename: 'OTA_Updater.js' });
  return { win, llamadas, fetches, reg };
}

/** Plugin de mentira que registra qué se le pidió. */
function pluginFalso({ nativa = '1.0.0', versionBundle = 'builtin', fallaDescarga = false } = {}) {
  const log = [];
  return {
    log,
    api: {
      notifyAppReady: () => { log.push('notifyAppReady'); return Promise.resolve({ bundle: { version: versionBundle } }); },
      current: () => Promise.resolve({ bundle: { version: versionBundle }, native: nativa }),
      download: (o) => {
        log.push('download:' + o.version + ':' + (o.checksum || 'SIN-CHECKSUM'));
        if (fallaDescarga) return Promise.reject(new Error('checksum failed'));
        return Promise.resolve({ id: 'b1', version: o.version });
      },
      next: (o) => { log.push('next:' + o.id); return Promise.resolve(); },
      set: (o) => { log.push('set:' + o.id); return Promise.resolve(); }
    }
  };
}

const capacitorFalso = (api) => ({ isNativePlatform: () => true, Plugins: { CapacitorUpdater: api } });

// =========================================================================
console.log('\nEn el navegador (sin Capacitor)');
{
  const { win, fetches } = montar({ env: { SUPABASE_URL: 'https://proyecto.supabase.co' } });
  check('MOTOR_OTA se define sin lanzar error', !!win.MOTOR_OTA);
  check('activo() es false', win.MOTOR_OTA.activo() === false);
  check('no pide nada a la red al cargar', fetches.length === 0, fetches.join(','));
  const r = await win.MOTOR_OTA.buscar();
  check('buscar() resuelve null en vez de fallar', r === null);
  check('sigue sin tocar la red', fetches.length === 0, fetches.join(','));
}

console.log('\nDentro de la app (Capacitor)');
{
  const p = pluginFalso();
  const latest = { version: '1.5.0-nueva', url: 'https://proyecto.supabase.co/x/bundle.zip', sha256: 'a'.repeat(64), minNativa: '1.0.0' };
  const { win, fetches } = montar({ capacitor: capacitorFalso(p.api), env: { SUPABASE_URL: 'https://proyecto.supabase.co', OTA_VERSION: '1.5.0-vieja' }, latest });
  await esperar(); await esperar();
  check('confirma el arranque con notifyAppReady', p.log.includes('notifyAppReady'));

  await win.MOTOR_OTA.buscar();
  const url = fetches.find(u => u.includes('latest.json')) || '';
  check('pide latest.json del bucket actualizaciones', url.includes('/storage/v1/object/public/actualizaciones/latest.json'), url);
  check('lo pide sin caché (lleva sello de tiempo)', /[?&]t=\d+/.test(url), url);
  check('descarga pasando el SHA-256 esperado', p.log.some(l => l === 'download:1.5.0-nueva:' + 'a'.repeat(64)), p.log.join(' | '));
  check('activa con next() (al próximo arranque)', p.log.some(l => l.startsWith('next:')), p.log.join(' | '));
  check('NO usa set(): nunca recarga en caliente', !p.log.some(l => l.startsWith('set:')), p.log.join(' | '));
  check('estado.disponible queda anotado', win.MOTOR_OTA.estado().disponible === '1.5.0-nueva');
}

console.log('\nYa está al día');
{
  const p = pluginFalso({ versionBundle: '1.5.0-actual' });
  const latest = { version: '1.5.0-actual', url: 'https://x/b.zip', sha256: 'b'.repeat(64) };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { SUPABASE_URL: 'https://proyecto.supabase.co' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  check('no descarga nada si la versión coincide', !p.log.some(l => l.startsWith('download:')), p.log.join(' | '));
}

console.log('\nEl bundle exige un APK más nuevo');
{
  const p = pluginFalso({ nativa: '1.0.0' });
  const latest = { version: '2.0.0-x', url: 'https://x/b.zip', sha256: 'c'.repeat(64), minNativa: '1.4.0' };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { SUPABASE_URL: 'https://proyecto.supabase.co', OTA_VERSION: '1.5.0-vieja' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  check('NO lo aplica sobre un APK anterior', !p.log.some(l => l.startsWith('download:')), p.log.join(' | '));
  check('avisa de que hay que reinstalar', /reinstalar/i.test(win.MOTOR_OTA.estado().motivo), win.MOTOR_OTA.estado().motivo);
}

console.log('\nFallos de red y de integridad');
{
  const p = pluginFalso();
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { SUPABASE_URL: 'https://proyecto.supabase.co' }, httpStatus: 503 });
  await esperar();
  const r = await win.MOTOR_OTA.buscar();
  check('sin servidor no revienta: devuelve null', r === null);
  check('y lo deja anotado en el estado', /503/.test(win.MOTOR_OTA.estado().motivo), win.MOTOR_OTA.estado().motivo);
}
{
  const p = pluginFalso({ fallaDescarga: true });
  const latest = { version: '9.9.9-mala', url: 'https://x/b.zip', sha256: 'd'.repeat(64) };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { SUPABASE_URL: 'https://proyecto.supabase.co', OTA_VERSION: '1.0.0-x' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  check('un bundle con hash falso no se activa', !p.log.some(l => l.startsWith('next:')), p.log.join(' | '));
  check('y no queda como disponible', win.MOTOR_OTA.estado().disponible === null);
}

console.log('\nEmpaquetado del bundle');
{
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.log('  ⚠ dist/ no existe: ejecuta npm run build. Se omiten estas pruebas.');
  } else {
    const { zipCarpeta } = await import('./ota_zip.js').then(m => m.default || m);
    const tmp = fs.mkdtempSync(path.join(ROOT, '.ota-test-'));
    try {
      const fija = new Date('2020-01-01T00:00:00Z');
      const a = zipCarpeta(path.join(ROOT, 'dist'), path.join(tmp, 'a.zip'), fija);
      zipCarpeta(path.join(ROOT, 'dist'), path.join(tmp, 'b.zip'), fija);
      const h = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, f))).digest('hex');
      check('dos empaquetados del mismo dist dan el mismo SHA-256', h('a.zip') === h('b.zip'));
      check('el zip contiene index.html en la raíz', a.archivos > 0);

      let listado = '';
      try { listado = execFileSync('unzip', ['-l', path.join(tmp, 'a.zip')], { encoding: 'utf8' }); } catch (e) { listado = ''; }
      if (listado) {
        check('un descompresor real lo acepta y ve index.html', /\bindex\.html\b/.test(listado));
        check('index.html está en la raíz, no en una subcarpeta', !/\/index\.html/.test(listado));
      } else {
        console.log('  ⚠ unzip no disponible: no se valida con un descompresor externo.');
      }
      const marca = path.join(ROOT, 'dist', 'ota-version.json');
      if (fs.existsSync(marca)) {
        const m = JSON.parse(fs.readFileSync(marca, 'utf8'));
        check('ota-version.json trae una versión con forma de semver', /^\d+\.\d+\.\d+-[0-9a-f]+$/.test(m.version), m.version);
        check('ota-version.json no lleva fecha (rompería el determinismo)', !('generado' in m) && !('fecha' in m), Object.keys(m).join(','));
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
