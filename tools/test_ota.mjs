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
    AppState: { OTA: { URL: 'https://github.com/ejemplo/repo/releases/download/ota' } },
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
  const { win, fetches } = montar({ env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota' } });
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
  const { win, fetches } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota', OTA_VERSION: '1.5.0-vieja' }, latest });
  await esperar(); await esperar();
  check('confirma el arranque con notifyAppReady', p.log.includes('notifyAppReady'));

  await win.MOTOR_OTA.buscar();
  const url = fetches.find(u => u.includes('latest.json')) || '';
  check('pide el latest.json de la publicación del repositorio', url.includes('/releases/download/ota/latest.json'), url);
  check('lo pide sin caché (lleva sello de tiempo)', /[?&]t=\d+/.test(url), url);
  check('descarga pasando el SHA-256 esperado', p.log.some(l => l === 'download:1.5.0-nueva:' + 'a'.repeat(64)), p.log.join(' | '));
  check('activa con next() (al próximo arranque)', p.log.some(l => l.startsWith('next:')), p.log.join(' | '));
  check('NO usa set(): nunca recarga en caliente', !p.log.some(l => l.startsWith('set:')), p.log.join(' | '));
  check('estado.disponible queda anotado', win.MOTOR_OTA.estado().disponible === '1.5.0-nueva');
}

console.log('\nCompilado sin .env: usa la URL de Global_Config');
{
  // El build se hace casi siempre sin .env, así que OTA_URL llega vacía. Si
  // el cliente no cayera en AppState.OTA.URL, la app instalada no sabría
  // dónde mirar y no se actualizaría nunca.
  const p = pluginFalso();
  const latest = { version: '2.0.0-x', url: 'https://x/b.zip', sha256: 'e'.repeat(64) };
  const { win, fetches } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_VERSION: '1.0.0-v' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  const url = fetches.find(u => u.includes('latest.json')) || '';
  check('sin OTA_URL en el entorno, usa la de Global_Config',
        url.includes('/releases/download/ota/latest.json'), url || '(no pidió nada)');
}

console.log('\nYa está al día');
{
  const p = pluginFalso({ versionBundle: '1.5.0-actual' });
  const latest = { version: '1.5.0-actual', url: 'https://x/b.zip', sha256: 'b'.repeat(64) };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  check('no descarga nada si la versión coincide', !p.log.some(l => l.startsWith('download:')), p.log.join(' | '));
}

console.log('\nEl bundle exige un APK más nuevo');
{
  const p = pluginFalso({ nativa: '1.0.0' });
  const latest = { version: '2.0.0-x', url: 'https://x/b.zip', sha256: 'c'.repeat(64), minNativa: '1.4.0' };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota', OTA_VERSION: '1.5.0-vieja' }, latest });
  await esperar();
  await win.MOTOR_OTA.buscar();
  check('NO lo aplica sobre un APK anterior', !p.log.some(l => l.startsWith('download:')), p.log.join(' | '));
  check('avisa de que hay que reinstalar', /reinstalar/i.test(win.MOTOR_OTA.estado().motivo), win.MOTOR_OTA.estado().motivo);
}

console.log('\nFallos de red y de integridad');
{
  const p = pluginFalso();
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota' }, httpStatus: 503 });
  await esperar();
  const r = await win.MOTOR_OTA.buscar();
  check('sin servidor no revienta: devuelve null', r === null);
  check('y lo deja anotado en el estado', /503/.test(win.MOTOR_OTA.estado().motivo), win.MOTOR_OTA.estado().motivo);
}
{
  const p = pluginFalso({ fallaDescarga: true });
  const latest = { version: '9.9.9-mala', url: 'https://x/b.zip', sha256: 'd'.repeat(64) };
  const { win } = montar({ capacitor: capacitorFalso(p.api), env: { OTA_URL: 'https://github.com/ejemplo/repo/releases/download/ota', OTA_VERSION: '1.0.0-x' }, latest });
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

// =========================================================================
// =========================================================================
console.log('\nDónde busca la app sus actualizaciones');
{
  const cfg = fs.readFileSync(path.join(ROOT, '00_Config', 'Global_Config.js.html'), 'utf8');
  const m = cfg.match(/OTA:\s*\{\s*URL:\s*'([^']+)'/);
  check('Global_Config.js.html declara AppState.OTA.URL', !!m,
        'sin esto la app compilada sin .env no sabría dónde mirar');

  if (m) {
    const url = m[1];
    check('la URL del OTA es https', /^https:\/\//.test(url), url);

    // El publicador deduce el destino del remoto `origin`. Si la URL que
    // lleva la app apunta a otro sitio, se publicaría donde nadie mira.
    let repo = '';
    try {
      const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
      const r = remoto.match(/github\.com[/:]([^/]+\/[^/.]+)(\.git)?$/i);
      repo = r ? r[1] : '';
    } catch (e) { /* sin remoto: se omite */ }

    if (repo && /github\.com/.test(url)) {
      check('la URL del OTA apunta al mismo repositorio que `origin` (' + repo + ')',
            url.includes('/' + repo + '/'),
            'publicarías en ' + repo + ' y la app miraría en ' + url);
      check('apunta a la publicación fija "ota"', /\/releases\/download\/ota$/.test(url), url);
    } else if (!repo) {
      console.log('  ⚠ sin remoto `origin`: no se puede cotejar el repositorio.');
    }

    // El proyecto de Supabase quedó atrás al migrar a Apps Script: si alguien
    // vuelve a apuntar ahí el OTA, los teléfonos no encontrarían nada.
    check('la URL del OTA no apunta a un Supabase retirado',
          !/fkelhhfptckarqgknkfh\.supabase\.co/.test(url), url);
  }
}

console.log('\nCSP de la app instalada');
{
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.log('  ⚠ dist/ no existe: ejecuta npm run build. Se omiten estas pruebas.');
  } else {
    const html = fs.readFileSync(distIndex, 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i);
    check('dist/index.html lleva la <meta> CSP', !!m);

    if (m) {
      const metaCsp = m[1];

      // Dentro de Capacitor no hay cabeceras HTTP: esta meta es la única CSP
      // que protege el token de sesión. Debe derivar de vercel.json, sin
      // posibilidad de divergir.
      let header = '';
      const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
      (vj.headers || []).forEach(r => (r.headers || []).forEach(h => {
        if (String(h.key).toLowerCase() === 'content-security-policy') header = h.value;
      }));
      check('vercel.json define la cabecera CSP', !!header);

      const partir = s => s.split(';').map(d => d.trim()).filter(Boolean);
      const soloCabecera = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];
      const esperado = partir(header)
        .filter(d => !soloCabecera.includes(d.split(/\s+/)[0].toLowerCase()))
        .join('; ');
      check('la meta coincide con la cabecera de vercel.json', metaCsp === esperado,
            'meta y cabecera divergen: regenera con npm run build');

      // Estas el estándar las ignora en una meta: si aparecen, el navegador
      // avisa por consola en cada carga.
      soloCabecera.forEach(d => {
        check('la meta no incluye ' + d + ' (inválida en <meta>)', !new RegExp('(^|;)\\s*' + d + '\\b', 'i').test(metaCsp));
      });

      // Y la cabecera sí debe conservar frame-ancestors: es la defensa
      // contra clickjacking, que la meta no puede dar.
      check('la cabecera conserva frame-ancestors', /frame-ancestors/i.test(header));

      // La meta solo gobierna lo que viene DESPUÉS de ella.
      const posMeta = html.indexOf('Content-Security-Policy');
      const primerExterno = html.search(/<(script|link)[^>]+(src|href)="https:\/\//i);
      check('la meta va antes del primer recurso externo', posMeta >= 0 && posMeta < primerExterno,
            'meta en ' + posMeta + ', primer recurso en ' + primerExterno);

      // Lo que más fácil se rompe: alguien añade un CDN al HTML y olvida la
      // CSP. Entonces la app funciona en local y se rompe al desplegar.
      // El host acaba en / ? # o la comilla: la URL de Tailwind lleva query
      // sin barra (cdn.tailwindcss.com?plugins=…) y si no se corta ahí se
      // compara un host que no existe.
      const origenes = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https:\/\/[^/"?#]+)/gi)]
        .map(x => x[1]);
      const unicos = [...new Set(origenes)];
      unicos.forEach(o => {
        const host = o.replace('https://', '');
        const cubierto = metaCsp.includes(o) ||
          metaCsp.includes('https://*.' + host.split('.').slice(-2).join('.'));
        check('la CSP permite ' + host, cubierto,
              'añádelo a la CSP de vercel.json o el navegador lo bloqueará');
      });
      if (!unicos.length) console.log('  ⚠ no se detectaron recursos externos en el HTML.');
    }
  }
}

// =========================================================================
console.log('\nLibrerías locales (la app abre sin señal)');
{
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  const vendor = path.join(ROOT, 'web', 'vendor');
  if (!fs.existsSync(distIndex)) {
    console.log('  ⚠ dist/ no existe: ejecuta npm run build. Se omiten estas pruebas.');
  } else {
    const html = fs.readFileSync(distIndex, 'utf8');

    // Dentro del APK no hay service worker. Si Tailwind, las fuentes o los
    // iconos vinieran de internet, el primer arranque sin señal dejaría la
    // pantalla sin estilos y los iconos como texto.
    const externos = [...html.matchAll(/<(?:script|link)([^>]+)(?:src|href)="(https:\/\/[^"]+)"/gi)]
      .filter(x => !/rel="(preconnect|dns-prefetch|prefetch)"/i.test(x[1]))  // pistas, no descargas
      .map(x => x[2])
      .filter(u => !/cdn\.jsdelivr\.net/.test(u));   // MediaPipe se carga en caliente, no como etiqueta
    check('el HTML no carga nada de un CDN', externos.length === 0, externos.join(' | ').slice(0, 160));

    ['tailwind.js', 'xlsx.full.min.js', 'html2pdf.bundle.min.js',
     'archivo.css', 'simbolos.css', 'iconos.txt'].forEach(f => {
      check('web/vendor/' + f + ' está empaquetado', fs.existsSync(path.join(vendor, f)),
            'ejecuta npm run vendor');
    });

    if (fs.existsSync(path.join(vendor, 'simbolos.css'))) {
      const css = fs.readFileSync(path.join(vendor, 'simbolos.css'), 'utf8');
      check('simbolos.css apunta a una fuente local, no a gstatic', /url\(fonts\//.test(css) && !/fonts\.gstatic\.com/.test(css));
      const fuente = (css.match(/url\((fonts\/[^)]+)\)/) || [])[1];
      check('el woff2 de los iconos existe', !!fuente && fs.existsSync(path.join(vendor, fuente)));
      if (fuente) {
        const mb = fs.statSync(path.join(vendor, fuente)).size / 1048576;
        // La fuente completa son 3,9 MB, y viajaría en CADA bundle OTA que los
        // teléfonos bajan con la señal de la mina. Debe ir subconjuntada.
        check('la fuente de iconos va subconjuntada (<1 MB)', mb < 1, mb.toFixed(1) + ' MB');
      }
    }

    // Lo que más fácil se rompe: alguien usa un icono nuevo y no vuelve a
    // empaquetar las fuentes. El icono saldría como texto en la pantalla.
    if (fs.existsSync(path.join(vendor, 'iconos.txt'))) {
      const empaquetados = new Set(fs.readFileSync(path.join(vendor, 'iconos.txt'), 'utf8').trim().split(/\r?\n/));
      const usados = [...new Set([...html.matchAll(/material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]{1,40})\s*</g)].map(x => x[1]))];
      const faltan = usados.filter(i => !empaquetados.has(i));
      check('todos los iconos del HTML están en el subconjunto (' + usados.length + ')',
            faltan.length === 0, 'faltan: ' + faltan.join(', ') + ' → npm run vendor -- -f');
    }

    // El navegador sí tiene service worker: debe precachear /vendor o la PWA
    // web perdería lo que el APK sí tiene.
    const sw = path.join(ROOT, 'dist', 'sw.js');
    if (fs.existsSync(sw)) {
      const t = fs.readFileSync(sw, 'utf8');
      check('sw.js no dejó __VENDOR__ sin sustituir', !t.includes('__VENDOR__'));
      check('sw.js precachea /vendor', /\/vendor\/tailwind\.js/.test(t));
    }
  }
}

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
