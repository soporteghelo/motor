/**
 * tools/test_sync.mjs — cola sin conexión: que lo guardado SIEMPRE acabe subiendo
 *
 *   npm i --no-save fake-indexeddb@6.0.0
 *   npm run test:sync
 *
 * Ejecuta el Offline_Engine REAL (no una copia) sobre un IndexedDB de mentira,
 * con el servidor simulado, y comprueba el comportamiento que de verdad
 * importa en campo:
 *
 *   · Un fallo de red NO cuenta como rechazo. Si contara, un trabajador sin
 *     señal gastaría los 5 intentos, el registro quedaría "bloqueado" y ya no
 *     subiría solo nunca más — que es exactamente el fallo que se corrigió.
 *   · Un rechazo REAL del servidor (dato inválido, permiso) sí cuenta y acaba
 *     bloqueando, para no reintentar en bucle algo que nunca va a entrar.
 *   · Al volver la señal, lo pendiente sube sin que nadie pulse nada.
 *   · Lo que se bloqueó por falta de señal se rehabilita al arrancar.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fail = 0;
const check = (nombre, cond, extra) => {
  if (cond) { ok++; console.log('  ✔ ' + nombre); }
  else { fail++; console.log('  ✘ ' + nombre + (extra ? ' — ' + extra : '')); }
};

const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');

const fuente = fs.readFileSync(path.join(ROOT, '00_Config', 'Offline_Engine.js.html'), 'utf8')
  .replace(/^[\s\S]*?<script>/, '').replace(/<\/script>\s*$/, '');

/**
 * Monta el motor con un servidor simulado.
 * @param {() => object|Promise<object>} responder  lo que contesta syncQueue
 */
async function montar(responder, opciones = {}) {
  // Base nueva por prueba: el nombre cambia para no compartir estado
  const nombreDB = 'prueba_' + Math.random().toString(36).slice(2);
  const sincronizaciones = [];
  const avisos = [];

  const almacen = new Map();
  const win = {
    indexedDB, IDBKeyRange,
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    Promise, JSON, Date, Number, String, Object, Array, Math, RegExp, Boolean, Error,
    localStorage: {
      getItem: k => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: k => almacen.delete(k)
    },
    navigator: { onLine: opciones.onLine !== false },
    document: { addEventListener() {}, visibilityState: 'visible' },
    addEventListener() {},
    updateSyncUI: (txt, off, n) => avisos.push({ txt, off, n }),
    AppState: {
      User: { Token: 'tok', DNI: '12345678' },
      DB_PROVIDER: 'appscript',
      Settings: { MaxBatchSize: 50 }
    },
    DataService: {
      syncQueue: async (modulo, lote) => {
        sincronizaciones.push({ modulo, n: lote.length });
        return await responder(modulo, lote);
      }
    },
    PWA_SKILLS: { toast() {} },
    // El motor comprueba `opciones instanceof Event` (cuando lo llama un
    // addEventListener del navegador). En Node no existe: basta la clase.
    Event: class Event {}
  };
  if (opciones.capacitor) win.Capacitor = { isNativePlatform: () => true };
  win.window = win;
  win.self = win;

  const ctx = vm.createContext(win);
  // El nombre de la base se cambia para aislar cada prueba
  vm.runInContext(fuente.replace(/"Enterprise_PWA_DB"/, JSON.stringify(nombreDB)), ctx, { filename: 'Offline_Engine.js' });

  await ctx.initOfflineDB();
  return { ctx, sincronizaciones, avisos };
}

/**
 * `localDB` se declara con `let`: vive en el ámbito léxico del script, no
 * como propiedad del contexto. Se lee evaluando su nombre dentro del VM.
 */
const enVM = (ctx, expr) => vm.runInContext(expr, ctx);

/** Mete un registro en la cola tal como lo haría un formulario. */
function encolar(ctx, modulo, uuid, extra = {}) {
  return new Promise((resolve, reject) => {
    const tx = enVM(ctx, 'localDB').transaction(['Pending_Transactions_Queue'], 'readwrite');
    const req = tx.objectStore('Pending_Transactions_Queue').add(Object.assign({
      module: modulo, payload: { UUID: uuid }, childPayload: [], fecha: new Date().toISOString()
    }, extra));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const pendientes = ctx => ctx.readAllPendings();

// =========================================================================
console.log('\nSin señal: los intentos fallidos no deben bloquear nada');
{
  // Lo que devuelve DataProvider cuando no hay red (ver _call en DataProvider)
  const sinRed = () => ({ status: 'ERROR', msg: 'Sin conexión con Apps Script: Failed to fetch', transitorio: true });
  const { ctx } = await montar(sinRed);
  await encolar(ctx, '03_Inspecciones', 'u1');

  // Más intentos que SYNC_MAX_RECHAZOS: sin señal esto pasa en minutos
  for (let i = 0; i < 8; i++) await ctx.triggerSyncToCloud({ origen: 'reintento' });

  const items = await pendientes(ctx);
  check('el registro sigue en la cola', items.length === 1);
  check('NO queda bloqueado tras 8 intentos sin red', items[0] && !items[0].bloqueado,
        'rechazos=' + (items[0] && items[0].rechazos));
  check('no acumula rechazos', !items[0] || !items[0].rechazos, 'rechazos=' + (items[0] && items[0].rechazos));
}

console.log('\nVuelve la señal: sube solo, sin pulsar nada');
{
  let hayRed = false;
  const responder = () => hayRed
    ? { status: 'OK' }
    : { status: 'ERROR', msg: 'Sin conexión con Apps Script: Failed to fetch', transitorio: true };

  const { ctx, sincronizaciones } = await montar(responder);
  await encolar(ctx, '05_Incidentes', 'u2');
  await encolar(ctx, '05_Incidentes', 'u3');

  for (let i = 0; i < 6; i++) await ctx.triggerSyncToCloud({ origen: 'reintento' });
  check('sin red no sube nada', (await pendientes(ctx)).length === 2);

  hayRed = true;
  const r = await ctx.triggerSyncToCloud({ origen: 'reintento' });   // el reintento periódico
  check('al volver la red sube los 2', r.subidos === 2, JSON.stringify(r));
  check('la cola queda vacía', (await pendientes(ctx)).length === 0);
  check('no hizo falta forzar', sincronizaciones.length > 0);
}

console.log('\nRechazo real del servidor: sí cuenta y acaba bloqueando');
{
  const rechazo = () => ({ status: 'ERROR', msg: 'El campo Fecha es obligatorio' });
  const { ctx } = await montar(rechazo);
  await encolar(ctx, '07_IPERC', 'u4');

  for (let i = 0; i < 5; i++) await ctx.triggerSyncToCloud({ origen: 'reintento' });
  const items = await pendientes(ctx);
  check('un dato inválido sí acumula rechazos', items[0] && items[0].rechazos >= 5,
        'rechazos=' + (items[0] && items[0].rechazos));
  check('y acaba bloqueado (no se reintenta en bucle)', items[0] && items[0].bloqueado === true);
  check('pero NO se pierde: sigue guardado', items.length === 1);
}

console.log('\nINVALID_TOKEN (sesión caducada) es transitorio');
{
  const { ctx } = await montar(() => ({ status: 'INVALID_TOKEN', msg: 'Tu sesión expiró.' }));
  await encolar(ctx, '08_PETAR', 'u5');
  for (let i = 0; i < 7; i++) await ctx.triggerSyncToCloud({ origen: 'reintento' });
  const items = await pendientes(ctx);
  check('no se bloquea por una sesión caducada', items[0] && !items[0].bloqueado);
}

console.log('\nRescate de lo que ya quedó bloqueado por el fallo anterior');
{
  const { ctx } = await montar(() => ({ status: 'OK' }));
  // Así quedaron los registros en los teléfonos antes de la corrección
  await encolar(ctx, '03_Inspecciones', 'u6', { bloqueado: true, rechazos: 5, ultimoError: 'Sin conexión con Apps Script: Failed to fetch' });
  // Y uno bloqueado por un motivo REAL, que debe seguir bloqueado
  await encolar(ctx, '03_Inspecciones', 'u7', { bloqueado: true, rechazos: 5, ultimoError: 'El campo Fecha es obligatorio' });

  const rescatados = await ctx.rehabilitarBloqueadosPorRed();
  check('rescata el bloqueado por falta de señal', rescatados === 1, 'rescatados=' + rescatados);

  const items = await pendientes(ctx);
  const u6 = items.find(i => i.payload.UUID === 'u6');
  const u7 = items.find(i => i.payload.UUID === 'u7');
  check('u6 vuelve a la cola normal', u6 && !u6.bloqueado && !u6.rechazos);
  check('u7 (rechazo real) sigue bloqueado', u7 && u7.bloqueado === true);

  const r = await ctx.triggerSyncToCloud({ origen: 'inicio' });
  check('el rescatado sube solo', r.subidos === 1, JSON.stringify(r));
  check('el rechazado real no se cuela', (await pendientes(ctx)).some(i => i.payload.UUID === 'u7'));
}

console.log('\nReconocer un fallo de red por el mensaje');
{
  const { ctx } = await montar(() => ({ status: 'OK' }));
  [['Sin conexión con Apps Script: Failed to fetch', true],
   ['NetworkError when attempting to fetch resource', true],
   ['Apps Script respondió HTTP 503', true],
   ['Servidor ocupado. Se reintentará en unos segundos.', true],
   ['net::ERR_INTERNET_DISCONNECTED', true],
   ['El campo Fecha es obligatorio', false],
   ['No tienes permiso para editar este registro.', false],
   ['Un PETAR no puede aprobarlo la misma persona que lo solicitó.', false]
  ].forEach(([msg, esperado]) => {
    check((esperado ? 'red: ' : 'rechazo: ') + msg.slice(0, 44), ctx.esFalloDeRed(msg) === esperado);
  });
}

console.log('\nIndicador y contador del Header');
{
  const { ctx, avisos } = await montar(() => ({ status: 'ERROR', msg: 'Failed to fetch', transitorio: true }));
  await encolar(ctx, '09_EPP', 'u8');
  await encolar(ctx, '09_EPP', 'u9');
  await ctx.actualizarIndicadorSync();
  const ultimo = avisos[avisos.length - 1];
  check('informa 2 cambios sin enviar', ultimo && ultimo.n === 2, JSON.stringify(ultimo));

  const { ctx: ctx2, avisos: avisos2 } = await montar(() => ({ status: 'OK' }));
  await ctx2.actualizarIndicadorSync();
  const u2 = avisos2[avisos2.length - 1];
  // La pastilla dice UNA palabra (el enlace con el servidor); el número de
  // pendientes va aparte, sobre el botón. Repetirlo en el texto partía la
  // cabecera en dos líneas en el móvil.
  check('con la cola vacía informa 0 (el número desaparece)', u2 && u2.n === 0 && /conectado/i.test(u2.txt),
        JSON.stringify(u2));
  check('el texto de estado no repite el número de pendientes',
        !/\d/.test(String(ultimo.txt)) && !/\d/.test(String(u2.txt)),
        JSON.stringify([ultimo.txt, u2.txt]));
}

console.log('\nDentro del APK no se hace caso a navigator.onLine');
{
  // En el WebView de Android vale siempre true aunque no haya señal; y si
  // alguna versión lo dejara en false, creerle pararía la cola para siempre.
  const { ctx, sincronizaciones } = await montar(() => ({ status: 'OK' }), { onLine: false, capacitor: true });
  await encolar(ctx, '10_Charlas', 'u10');
  const r = await ctx.triggerSyncToCloud({ origen: 'reintento' });
  check('intenta subir aunque onLine diga false', sincronizaciones.length === 1);
  check('y sube el registro', r.subidos === 1, JSON.stringify(r));

  // En un navegador de verdad sí es fiable: ahí sí ahorra el intento
  const { ctx: cNav, sincronizaciones: sNav } = await montar(() => ({ status: 'OK' }), { onLine: false });
  await encolar(cNav, '10_Charlas', 'u11');
  const rNav = await cNav.triggerSyncToCloud({ origen: 'reintento' });
  check('en el navegador sin red no gasta la llamada', sNav.length === 0 && rNav.motivo === 'sin-red');
}

console.log('\nCabecera: el numero vive SOBRE el boton de sincronizar');
{
  // Lo que ve el trabajador antes de cerrar la app. Si el distintivo sale del
  // boton, o la pastilla vuelve a llevar el conteo, la cabecera se parte en
  // dos lineas en el movil y el aviso deja de leerse.
  const index = fs.readFileSync(path.join(ROOT, '00_Config', 'Index.html'), 'utf8');
  const boton = index.match(/<button id="ui-global-sync-btn"[\s\S]*?<\/button>/);
  check('el distintivo esta DENTRO del boton de sincronizar',
        !!boton && /id="ui-sync-badge"/.test(boton[0]));
  check('el boton ancla el distintivo (.sync-btn position:relative)',
        /\.sync-btn\s*\{[^}]*position:\s*relative/.test(index));
  check('la pastilla de estado existe y arranca conectada',
        /class="sync-indicator is-ok" id="ui-sync-chip"/.test(index));

  // El boton se ve en toda la app con sesion abierta (tambien en el panel).
  const router = fs.readFileSync(path.join(ROOT, '00_Config', 'App_Routing.js.html'), 'utf8');
  check('el boton de sincronizar solo se oculta en el Login',
        /syncBtn\.style\.display = \(viewID === 'Login'\) \? 'none' : 'flex'/.test(router));
  check('el panel no tiene un segundo boton de actualizar',
        !/mnu-refresh|dash-refresh-ico/.test(router));

  const skills = fs.readFileSync(path.join(ROOT, '00_Config', 'Global_Skills.js.html'), 'utf8');
  const trigger = skills.slice(skills.indexOf('triggerGlobalSync:'), skills.indexOf('SKILL 13'));
  check('al pulsarlo el icono gira desde el primer momento',
        /classList\.add\('sincronizando'\)/.test(trigger));
  check('el giro dura un minimo visible aunque la subida sea instantanea',
        /650 - \(Date\.now\(\) - arranque\)/.test(trigger));
  check('en el panel refresca los indicadores',
        /loadDashboardData\(true\)/.test(trigger));

  const motor = fs.readFileSync(path.join(ROOT, '00_Config', 'Offline_Engine.js.html'), 'utf8');
  const llamadas = motor.match(/updateSyncUI\([^;]*\)/g) || [];
  const textos = llamadas.map(l => l.split(',')[0]);
  check('ningun texto de estado lleva el conteo dentro',
        textos.every(t => !/pendiente\(s\)|\$\{/.test(t)), textos.join(' | '));
}

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
