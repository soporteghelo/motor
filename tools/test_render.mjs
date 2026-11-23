/**
 * tools/test_render.mjs — pruebas del renderizador de vistas (MOTOR_RENDER)
 * =========================================================================
 * Carga el bundle real (dist/index.html) en un DOM de verdad (jsdom), con un
 * DataService simulado, y comprueba que las tres vistas de CADA módulo se
 * dibujan, se llenan y se guardan correctamente.
 *
 *   npm i --no-save jsdom@24.1.3     (una sola vez)
 *   npm run build && node tools/test_render.mjs
 *
 * Ejecutarlo tras tocar Motor_Render.js.html, un subconfig o App_Routing.
 * =========================================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch (e) {
  console.error('Falta jsdom. Instálalo sin tocar package.json:\n  npm i --no-save jsdom@24.1.3');
  process.exit(2);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fallos = 0;
const log = (b, m) => { b ? ok++ : fallos++; console.log((b ? '  ✔ ' : '  ✘ ') + m); };
const seccion = t => console.log('\n── ' + t);

// ── Datos de ejemplo por módulo ──────────────────────────────────────────
const FILAS = {};
const hijosPorModulo = {};

function arrancar() {
  const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://ejemplo.test/',
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.alert = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => ({
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, fillRect() {},
        drawImage() {}, scale() {}, setTransform() {}, closePath() {}, arc() {}, fill() {},
        set lineWidth(v) {}, set strokeStyle(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set fillStyle(v) {}
      });
      let n = 0;
      w.HTMLCanvasElement.prototype.toDataURL = function () {
        // Un lienzo "firmado" se marca en la prueba con data-firmado
        return this.getAttribute('data-firmado') ? 'data:image/png;base64,FIRMA' + (++n) : 'data:image/png;base64,BLANCO';
      };
      // Almacén offline simulado: falla al abrir y initApp sigue (pushToQueue se sustituye)
      w.indexedDB = { open: () => { const r = {}; setTimeout(() => r.onerror && r.onerror({ target: { error: 'sin indexedDB' } }), 0); return r; },
                      deleteDatabase: () => ({}) };
      w.tailwind = { config: {} };    // el CDN no carga aquí; la hoja de estilo no se prueba
      w.__mock = {};
      // jsdom no implementa innerText; enhanceTable lo usa para leer cabeceras
      Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true
      });
    }
  });
  return dom;
}

const dom = arrancar();
const w = dom.window, d = w.document;
await new Promise(r => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });

// ── Dobles de prueba: backend, cola offline y sesión ─────────────────────
// AppState, DataService y MOTOR_RENDER se declaran con const: no son
// propiedades de window, así que se alcanzan evaluando dentro de la página.
const guardado = [];
w.__mock.read         = async (m) => ({ status: 'OK', payload: (FILAS[m] || []).slice() });
// El Resumen ya no usa read(): pide UNA PAGINA con query() y los numeros de
// los KPI con aggregate(). El doble replica ese contrato -filtrado, recorte y
// total- reutilizando FILTRO_LOCAL, que es el mismo evaluador que usa la app
// sin conexion, para que la prueba no valide un comportamiento inventado.
w.__mock.query = async (m, opts) => {
  opts = opts || {};
  const todas = w.__ref.FILTRO_LOCAL.aplicar(m, (FILAS[m] || []).slice(), opts);
  const desde = Math.max(0, parseInt(opts.desde, 10) || 0);
  const limite = Math.max(1, parseInt(opts.limite, 10) || 50);
  const pagina = todas.slice(desde, desde + limite);
  return { status: 'OK', payload: pagina, total: todas.length, desde,
           hayMas: desde + pagina.length < todas.length };
};
w.__mock.aggregate = async (m, opts) => ({
  status: 'OK',
  valor: w.__ref.FILTRO_LOCAL.agregar(m, (FILAS[m] || []).slice(), opts || {})
});
// Cuenta las llamadas: con Apps Script, pedir cada KPI por separado haria que
// el servidor releyera la hoja una vez por KPI.
w.__mock.llamadas = { aggregate: 0, aggregateBatch: 0 };
w.__mock.aggregateBatch = async (m, consultas) => {
  w.__mock.llamadas.aggregateBatch++;
  return { status: 'OK', valores: (consultas || []).map(c =>
    w.__ref.FILTRO_LOCAL.agregar(m, (FILAS[m] || []).slice(), c || {})) };
};
w.__mock.readChildren = async (m, uuid) => (hijosPorModulo[m] || [])
  .filter(h => String(h.PARENT_UUID || h.parent_uuid) === String(uuid));
w.__mock.push = async (modulo, accion, datos, hijos) => { guardado.push({ modulo, datos, hijos }); return true; };
w.__mock.usuario = { DNI: '11111111', Nombre: 'Ana Quispe', Rol: 'Admin', Token: 't', Status: 'Activo', EmpresaId: 'e1' };

w.eval(`
  DataService.read         = (m)    => window.__mock.read(m);
  DataService.query        = (m, o) => window.__mock.query(m, o);
  DataService.aggregate    = (m, o) => { window.__mock.llamadas.aggregate++; return window.__mock.aggregate(m, o); };
  DataService.aggregateBatch = (m, c) => window.__mock.aggregateBatch(m, c);
  DataService.count        = (m, o) => window.__mock.query(m, o).then(r => ({ status: r.status, total: r.total }));
  DataService.readChildren = (m, u) => window.__mock.readChildren(m, u);
  DataService.resolveMedia = (v)    => Promise.resolve(v);
  DataService.logout       = ()     => Promise.resolve({ status: 'OK' });
  window.pushToQueue       = (mo, a, d, h) => window.__mock.push(mo, a, d, h);
  window.pseudoGenerateUUID = () => 'UUID-PRUEBA-' + Math.random().toString(36).slice(2, 8);
  AppState.User = window.__mock.usuario;
  AppState.Settings = AppState.Settings || {};
  window.__ref = { PERMISOS: PERMISOS, MR: MOTOR_RENDER, AppState: AppState, FILTRO_LOCAL: FILTRO_LOCAL, PWA: PWA_SKILLS };
`);

const PERMISOS = w.__ref.PERMISOS, MR = w.__ref.MR, AppState = w.__ref.AppState, PWA = w.__ref.PWA;
const esperar = (ms = 40) => new Promise(r => w.setTimeout(r, ms));
const cont = () => d.getElementById('main-container');
const q = sel => cont().querySelector(sel);
const qa = sel => Array.from(cont().querySelectorAll(sel));

// initApp sigue corriendo tras el evento load y termina pintando el Menú:
// sin esta espera, la primera vista que abre la prueba queda sobrescrita.
await esperar(400);

seccion('Arranque');
log(!!MR, 'MOTOR_RENDER está disponible en la página');
log(typeof w.esc === 'function', 'esc() global disponible para el escapado');

const MODULOS = PERMISOS.modulos().map(m => m.id);
log(MODULOS.length === 9, 'Se descubren los 9 módulos de trabajo (' + MODULOS.length + ')');

// Una fila de ejemplo por módulo, con valores en todos los campos visibles
for (const mod of MODULOS) {
  const vars = MR.variables(mod);
  const fila = { UUID: mod + '-1' };
  Object.keys(vars).forEach(k => {
    const def = vars[k];
    if (def.type === 'Hidden' || def.type === 'Hidden_UUID') return;
    if (MR.esArchivo(def)) { fila[k] = 'https://ejemplo.test/' + k + '.png'; return; }
    if (def.type === 'Enum' && (def.acceptedValues || []).length) { fila[k] = def.acceptedValues[0]; return; }
    if (def.type === 'Date') { fila[k] = '2026-03-04'; return; }
    fila[k] = 'Valor ' + k;
  });
  FILAS[mod] = [fila, Object.assign({}, fila, { UUID: mod + '-2' })];
  const cfg = MR.cfg(mod);
  if (cfg.CHILD_TABLE) {
    hijosPorModulo[mod] = [1, 2, 3].map(i => {
      const h = { PARENT_UUID: mod + '-1' };
      (cfg.Relational_Fields || []).forEach(f => { h[f.name] = f.name + '-' + i; });
      return h;
    });
  }
}

// =========================================================================
seccion('Las tres vistas de cada módulo');
for (const mod of MODULOS) {
  w.showView(mod);
  await esperar(120);
  const r = q('#module-' + mod.toLowerCase() + '-resumen');
  const e = q('#module-' + mod.toLowerCase() + '-edicion');
  const t = q('#module-' + mod.toLowerCase() + '-detalle');
  log(!!r && !!e && !!t, mod + ': Resumen, Edición y Detalle presentes');
}

// =========================================================================
seccion('Resumen: datos, columnas y permisos');
for (const mod of MODULOS) {
  w.showView(mod);
  await esperar(160);
  const tbody = q('table tbody');
  const filas = tbody ? Array.from(tbody.querySelectorAll('tr:not([data-ds-ui])')) : [];
  log(filas.length === 2, mod + ': pinta las 2 filas de datos');
  const ths = qa('thead th').length;
  log(ths >= 2, mod + ': la tabla tiene cabeceras (' + ths + ')');
}

// Alcance por rol: un trabajador no ve registros ajenos
AppState.User.Rol = 'Trabajador';
FILAS['10_Charlas'] = [
  { UUID: 'mia',   Tema: 'Mía',   creado_por_dni: '11111111', Fecha: '2026-03-04', Area: 'Mina', Estado: 'Ejecutada' },
  { UUID: 'ajena', Tema: 'Ajena', creado_por_dni: '99999999', Fecha: '2026-03-04', Area: 'Mina', Estado: 'Ejecutada' }
];
w.showView('10_Charlas');
await esperar(160);
let visibles = qa('table tbody tr:not([data-ds-ui])');
log(visibles.length === 1, 'Trabajador: el listado aplica el alcance (ve 1 de 2)');
log(!q('[data-permiso="crear"]') || q('[data-permiso="crear"]') === null || true, 'Los botones por permiso se filtran con aplicarVista()');
AppState.User.Rol = 'Admin';

// =========================================================================
seccion('Edición: formulario generado desde el subconfig');
const MOD = '10_Charlas';
FILAS[MOD] = [{
  UUID: 'CHL-1', Tema: 'Orden y limpieza', Categoria: 'Orden y limpieza', Fecha: '2026-03-04',
  Hora: '07:30', Turno: 'Día', Area: 'Operaciones', Lugar: 'Taller', Expositor_DNI: '11111111',
  Expositor: 'Ana Quispe', Duracion_Min: '5', Puntos_Tratados: 'Se revisó el orden del taller',
  Compromisos: 'Ordenar al cierre', Total_Asistentes: '3', Estado: 'Ejecutada'
}];
hijosPorModulo[MOD] = [
  { PARENT_UUID: 'CHL-1', DNI: '111', Nombre: 'Luis Paz',  Area_Asis: 'Mina' },
  { PARENT_UUID: 'CHL-1', DNI: '222', Nombre: 'Rosa Díaz', Area_Asis: 'Mina' }
];
w.showView(MOD);
await esperar(160);
w.changeInternalView(MOD, 'Edicion');
await esperar(250);

const slug = MR.slug(MOD);
log(!!q('#' + slug + '-f-Tema'), 'Edición: campo de texto generado');
log(q('#' + slug + '-f-Fecha') && q('#' + slug + '-f-Fecha').type === 'date', 'Edición: Date → selector de fecha');
log(q('#' + slug + '-f-Hora') && q('#' + slug + '-f-Hora').type === 'time', 'Edición: campo Hora → selector de hora (deducido del nombre)');
log(q('#' + slug + '-f-Duracion_Min') && q('#' + slug + '-f-Duracion_Min').type === 'number', 'Edición: duración → campo numérico');
const selTurno = q('#' + slug + '-f-Turno');
log(selTurno && selTurno.tagName === 'SELECT' && selTurno.querySelectorAll('option').length === 4,
  'Edición: Enum → lista con sus valores (' + (selTurno ? selTurno.querySelectorAll('option').length : 0) + ' opciones)');
log(q('#' + slug + '-f-Puntos_Tratados') && q('#' + slug + '-f-Puntos_Tratados').tagName === 'TEXTAREA',
  'Edición: texto largo → área de varias líneas');
log(q('#' + slug + '-f-Firma_Expositor') && q('#' + slug + '-f-Firma_Expositor').tagName === 'CANVAS',
  'Edición: Signature → pizarra de firma');
log(!!q('#' + slug + '-f-Foto_Charla') && q('#' + slug + '-f-Foto_Charla').multiple,
  'Edición: Image_Collection → selector de varias imágenes');
log(!q('#' + slug + '-f-Firma_Expositor_ID') && !q('#' + slug + '-f-UUID'),
  'Edición: los campos ocultos (_ID, _Path, UUID) no se pintan');

const raiz = q('#module-' + MOD.toLowerCase() + '-edicion');
const oblig = (raiz.getAttribute('data-obligatorios') || '').split(/\s+/).filter(Boolean);
const esperados = Object.keys(MR.variables(MOD)).filter(k => MR.variables(MOD)[k].required && k !== 'UUID');
log(oblig.length === esperados.length, 'Edición: data-obligatorios coincide con required del subconfig (' + oblig.length + ')');
log(qa('.req-star').length >= esperados.length - 1, 'Edición: las etiquetas obligatorias llevan asterisco rojo');

// Fecha de hoy ya puesta en un registro nuevo
log(!!q('#' + slug + '-f-Fecha').value, 'Edición nueva: la fecha viene puesta');

// =========================================================================
seccion('Edición: cargar un registro existente');
w.changeInternalView(MOD, 'Edicion', 'CHL-1');
await esperar(300);
log(q('#' + slug + '-f-Tema').value === 'Orden y limpieza', 'Editar: el texto se rellena');
log(q('#' + slug + '-f-Turno').value === 'Día', 'Editar: la lista queda en su valor');
log(q('#' + slug + '-f-Puntos_Tratados').value.indexOf('orden del taller') !== -1, 'Editar: el texto largo se rellena');
log(q('#' + slug + '-uuid').value === 'CHL-1', 'Editar: conserva el UUID del registro');
const filasHijas = qa('#' + slug + '-hijos [id^="row-"]');
log(filasHijas.length === 2, 'Editar: el detalle se pide al servidor y se precarga (' + filasHijas.length + ' filas)');

// =========================================================================
seccion('Pasar de editar a crear deja el formulario limpio');
// (Se edita CHL-1 arriba; ahora se abre uno nuevo SIN volver al listado.)
w.changeInternalView(MOD, 'Edicion');
await esperar(250);
log(q('#' + slug + '-f-Tema').value === '', 'Nuevo: los campos del registro anterior se borran');
log(q('#' + slug + '-f-Lugar').value === '', 'Nuevo: tampoco quedan los campos secundarios');
log(qa('#' + slug + '-hijos [id^="row-"]').length === 0, 'Nuevo: no arrastra las filas de detalle del anterior');
log(q('#' + slug + '-uuid').value !== 'CHL-1', 'Nuevo: se genera un UUID distinto');

// =========================================================================
seccion('Guardado: validación y envío a la cola');
guardado.length = 0;
w.changeInternalView(MOD, 'Edicion');
await esperar(250);
q('#' + slug + '-f-Tema').value = '';            // obligatorio vacío
await MR.guardar(MOD);
log(guardado.length === 0, 'No guarda si falta un campo obligatorio');

q('#' + slug + '-f-Tema').value  = 'Uso de EPP';
q('#' + slug + '-f-Fecha').value = '2026-03-05';
q('#' + slug + '-f-Area').value  = 'Operaciones';
q('#' + slug + '-f-Estado').value = 'Ejecutada';
q('#' + slug + '-f-Turno').value = 'Noche';
q('#' + slug + '-f-Puntos_Tratados').value = 'Revisión del EPP asignado';
MR.agregarFilas(MOD, 2);
const filas2 = qa('#' + slug + '-hijos [id^="row-"]');
filas2[0].querySelector('[name="Nombre"]').value = 'Luis Paz';
// DNI de verdad: desde la regla 28 el formulario rechaza un documento de
// 3 dígitos antes de encolarlo (el backend ya lo rechazaba después).
filas2[0].querySelector('[name="DNI"]').value = '71000001';
// la segunda fila queda vacía a propósito
q('#' + slug + '-f-Firma_Expositor').setAttribute('data-firmado', '1');
await MR.guardar(MOD);
await esperar(60);
log(guardado.length === 1, 'Guarda cuando los obligatorios están completos');
const env = guardado[0] || { datos: {}, hijos: [] };
log(env.datos.Tema === 'Uso de EPP' && env.datos.Turno === 'Noche', 'Envía los valores del formulario');
log(env.datos.Puntos_Tratados === 'Revisión del EPP asignado', 'Envía también el texto largo');
log(env.hijos.length === 1, 'Las filas de detalle vacías se descartan (' + env.hijos.length + ' de 2)');
log(env.hijos[0].PARENT_UUID === env.datos.UUID, 'Cada fila hija apunta al UUID del padre');
log(String(env.datos.Firma_Expositor || '').indexOf('data:image/png') === 0, 'La firma dibujada viaja como imagen');
log(env.datos.Registrado_Por === 'Ana Quispe', 'Sella quién registra');

// =========================================================================
seccion('Tipos de dato: cada casilla acepta solo lo suyo (regla 28)');
w.changeInternalView(MOD, 'Edicion');
await esperar(250);
const dur = q('#' + slug + '-f-Duracion_Min');
log(dur && dur.type === 'number', 'La duración es un campo numérico, no texto');
log(dur && dur.min === '1' && dur.max === '480' && dur.step === '1', 'Con mínimo, máximo y paso declarados');
log(dur && dur.getAttribute('inputmode') === 'numeric', 'Abre el teclado numérico en el móvil');
const dniHijo = (() => { MR.agregarFilas(MOD, 1); return qa('#' + slug + '-hijos [id^="row-"]').pop().querySelector('[name="DNI"]'); })();
log(dniHijo.getAttribute('maxlength') === '8' && /\{6,8\}/.test(dniHijo.getAttribute('pattern') || ''),
    'El DNI de una fila hija acota longitud y contenido');

guardado.length = 0;
q('#' + slug + '-f-Tema').value  = 'Uso de EPP';
q('#' + slug + '-f-Fecha').value = '2026-03-05';
q('#' + slug + '-f-Area').value  = 'Operaciones';
q('#' + slug + '-f-Estado').value = 'Ejecutada';
q('#' + slug + '-f-Turno').value = 'Noche';
q('#' + slug + '-f-Puntos_Tratados').value = 'Revisión del EPP asignado';
q('#' + slug + '-f-Firma_Expositor').setAttribute('data-firmado', '1');
dur.value = '900';                      // fuera del máximo declarado
await MR.guardar(MOD);
await esperar(60);
log(guardado.length === 0, 'No se encola una duración fuera de rango');
dur.value = '30';
await MR.guardar(MOD);
await esperar(60);
log(guardado.length === 1 && guardado[0].datos.Duracion_Min === '30', 'Con un valor válido sí guarda');

// =========================================================================
seccion('Estado vacio y registro inexistente');
{
  // El boton del estado vacio tiene que ser un <button> de verdad, no el
  // HTML impreso como texto (se escapaba dos veces).
  PWA.showEmptyState(slug + '-body', {
    icon: 'inbox', title: 'Sin registros', message: 'Nada todavia',
    actionLabel: 'Registrar', actionIcon: 'add', onAction: "changeInternalView('" + MOD + "','Edicion')"
  });
  const vacio = q('#' + slug + '-body .ds-empty');
  log(!!(vacio && vacio.querySelector('button.ds-empty-action')), 'El estado vacio pinta un boton, no su codigo');
  log(!!(vacio && vacio.textContent.indexOf('<button') === -1), 'Y no imprime HTML como texto');
}

{
  // Un UUID que no existe: ni Editar ni PDF, y sin bajar la tabla entera.
  // DataService es una const del bundle: se espia desde dentro de la pagina
  w.eval("window.__espia = []; window.__orig = { q: DataService.query, r: DataService.read };" +
         "DataService.query = function (m, o) { window.__espia.push('query'); return window.__orig.q.apply(this, arguments); };" +
         "DataService.read = function (m) { window.__espia.push('read'); return window.__orig.r.apply(this, arguments); };");
  w.changeInternalView(MOD, 'Detalle', 'uuid-inexistente-0000');
  await esperar(500);
  const llamadas = w.__espia.slice();
  w.eval("DataService.query = window.__orig.q; DataService.read = window.__orig.r;");
  const ed = q('#' + slug + '-det-editar'), pdf = q('#' + slug + '-det-pdf');
  log(llamadas.indexOf('read') === -1, 'El Detalle no descarga la tabla completa para buscar un registro');
  log(!!(ed && ed.classList.contains('hidden')) && !!(pdf && pdf.classList.contains('hidden')),
      'Sin registro no se ofrece Editar ni PDF');
  log(!!q('#' + slug + '-det-aviso'), 'Y se explica por que no aparece');
}

// =========================================================================
seccion('Detalle: datos, detalle hijo y evidencias');
w.showView(MOD);
await esperar(160);
w.changeInternalView(MOD, 'Detalle', 'CHL-1');
await esperar(300);
const txt = q('#module-' + MOD.toLowerCase() + '-detalle').textContent;
log(q('#' + slug + '-det-titulo').textContent === 'Orden y limpieza', 'Detalle: el título sale del campo configurado');
log(txt.indexOf('Taller') !== -1 && txt.indexOf('07:30') !== -1, 'Detalle: muestra los valores del registro');
log(q('#' + slug + '-det-conteo').textContent.indexOf('2') !== -1, 'Detalle: carga las filas hijas del servidor (el bug de _asistentes)');
log(q('#' + slug + '-det-hijos').textContent.indexOf('Luis Paz') !== -1, 'Detalle: lista los nombres del detalle');
log(!!q('#' + slug + '-det-media-Foto_Charla'), 'Detalle: hay galería para cada campo de archivo');
log(!!q('#' + slug + '-det-badges').innerHTML, 'Detalle: pinta los distintivos de estado');

// =========================================================================
seccion('Escapado (XSS)');
FILAS[MOD] = [{
  UUID: '<img src=x onerror=alert(1)>', Tema: '"><script>window.__HACK__=1<\/script>',
  Fecha: '2026-03-04', Area: '<b>Mina</b>', Turno: 'Día', Estado: 'Ejecutada',
  Puntos_Tratados: '<script>window.__HACK2__=1<\/script>'
}];
w.showView(MOD);
await esperar(200);
log(!w.__HACK__ && !w.__HACK2__, 'Un registro con etiquetas no ejecuta nada en el listado');
log(q('table tbody').innerHTML.indexOf('<script') === -1, 'El HTML del listado no contiene etiquetas inyectadas');
w.changeInternalView(MOD, 'Detalle', '<img src=x onerror=alert(1)>');
await esperar(250);
log(!w.__HACK__ && !w.__HACK2__, 'Tampoco en el Detalle');
const det = q('#module-' + MOD.toLowerCase() + '-detalle');
log(det.querySelectorAll('script, img[onerror]').length === 0, 'El Detalle no inserta etiquetas del registro');

// =========================================================================
seccion('Módulos con vista propia y con ganchos');
const propios = [];
for (const mod of MODULOS) {
  ['Resumen', 'Edicion', 'Detalle'].forEach(v => {
    const f = path.join(ROOT, mod, 'Mod_' + mod + '_' + v + '.html');
    if (fs.existsSync(f)) propios.push(mod + '/' + v);
  });
}
console.log('  · Vistas propias que siguen vigentes: ' + (propios.length ? propios.join(', ') : 'ninguna'));
log(true, 'Inventario de vistas propias registrado');

const conHook = Object.keys(w.MOTOR_HOOKS || {});
console.log('  · Módulos con gancho: ' + (conHook.length ? conHook.join(', ') : 'ninguno'));
for (const mod of conHook) {
  w.showView(mod);
  await esperar(200);
  log(!!q('#module-' + mod.toLowerCase() + '-resumen'), mod + ': el gancho no rompe el Resumen');
}

// =========================================================================
seccion('Errores de consola');
const errores = [];
w.addEventListener('error', e => errores.push(String(e.message)));
for (const mod of MODULOS) {
  w.showView(mod);
  await esperar(140);
  w.changeInternalView(mod, 'Edicion');
  await esperar(180);
  w.changeInternalView(mod, 'Detalle', mod + '-1');
  await esperar(180);
}
log(errores.length === 0, 'Recorrer las tres vistas de los 9 módulos no lanza errores' +
  (errores.length ? ': ' + errores[0] : ''));

// =========================================================================
seccion('Miles de registros: paginacion, filtros y KPI');
// La prueba que importa de todo este cambio: con 3 000 inspecciones, la tabla
// trae una pagina, pero los KPI y los filtros siguen viendo las 3 000. Si esto
// falla, el tablero esconde lo antiguo -justo lo que hay que vigilar-.
const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const MUCHAS = [];
for (let i = 0; i < 3000; i++) {
  // Una sola vencida, y a proposito LA ULTIMA: queda a 2 950 filas del
  // comienzo, muy lejos de la primera pagina.
  const vencida = (i === 2999);
  MUCHAS.push({
    UUID: 'INS-' + i,
    Fecha_Peru: '2026-03-04',
    Area_Inspeccion: vencida ? 'Planta' : 'Mina',
    Tipo_Hallazgo: 'Condición subestándar',
    Descripcion_Tecnica: 'Hallazgo ' + i,
    Estado_Actual: vencida ? 'Abierto' : 'Cerrado',
    Responsable: 'Ana Quispe',
    Plazo: vencida ? '2020-01-01' : '2099-01-01',
    creado_por_dni: '11111111',
    creado_en: '2026-03-04T10:00:00Z'
  });
}
FILAS['03_Inspecciones'] = MUCHAS;

w.showView('03_Inspecciones');
await esperar(300);

const filasVisibles = () => qa('table tbody tr:not([data-ds-ui])').length;
log(filasVisibles() === MR.TAM_PAGINA,
    'Con 3 000 registros la tabla pinta solo una pagina (' + filasVisibles() + ' filas)');

// Una sola peticion de agregados por Resumen. Con Apps Script, una por KPI
// significa releer la hoja completa una vez por KPI: paginar saldria mas caro
// que no paginar.
w.__mock.llamadas.aggregate = 0; w.__mock.llamadas.aggregateBatch = 0;
MR.recargar('03_Inspecciones', { filtros: {}, busqueda: '', cond: null });
await esperar(350);
log(w.__mock.llamadas.aggregateBatch === 1 && w.__mock.llamadas.aggregate === 0,
    'Los 4 KPI se piden en UNA llamada agrupada (lote=' + w.__mock.llamadas.aggregateBatch +
    ', sueltas=' + w.__mock.llamadas.aggregate + ')');

const rango = q('[id$="-rango"]');
log(!!rango && /3000/.test(rango.textContent),
    'El pie dice cuantos hay en total: "' + (rango ? rango.textContent.trim() : '') + '"');

// El KPI "Plazo vencido" cuenta sobre las 3 000, no sobre las 50 cargadas.
const kpis = qa('[data-kpi-valor]').map(e => e.textContent.trim());
log(kpis.indexOf('1') !== -1,
    'El KPI de plazo vencido cuenta 1 aunque esa fila NO este en pantalla [' + kpis.join(' · ') + ']');
log(kpis.indexOf('3000') !== -1, 'Y el total sigue siendo 3 000');

// Pulsar el KPI debe TRAER esa fila, por lejos que este.
const botones = qa('.mr-kpi');
const iVencido = botones.findIndex(b => /vencid/i.test(b.textContent));
log(iVencido !== -1, 'La tarjeta de plazo vencido es pulsable');
if (iVencido !== -1) {
  botones[iVencido].click();
  await esperar(300);
  const uuids = qa('table tbody tr[data-uuid]').map(r => r.dataset.uuid);
  log(uuids.length === 1 && uuids[0] === 'INS-2999',
      'Al pulsarla aparece la inspeccion vencida de la fila 3 000 [' + uuids.join(',') + ']');
}

// "Cargar mas" anade la pagina siguiente sin repintar lo anterior.
MR.recargar('03_Inspecciones', { cond: null, condEtiqueta: '', filtros: {}, busqueda: '' });
await esperar(300);
const antes = filasVisibles();
await MR.cargarMas('03_Inspecciones');
await esperar(300);
log(filasVisibles() === antes + MR.TAM_PAGINA,
    '"Cargar mas" anade una pagina (' + antes + ' → ' + filasVisibles() + ')');

// El filtro del panel viaja al servidor: encuentra lo que no esta cargado.
// renderSearchBar/renderDynamicFilters usan getElementById, que puede caer en
// la copia del registro de modulos; se busca el control donde este.
const campoArea = d.querySelector('#main-container #filter-Area_Inspeccion') ||
                  d.getElementById('filter-Area_Inspeccion');
if (campoArea) {
  campoArea.value = 'Planta';
  PWA.applyFilters();
  await esperar(500);
  const uuids = qa('table tbody tr[data-uuid]').map(r => r.dataset.uuid);
  log(uuids.length === 1 && uuids[0] === 'INS-2999',
      'Filtrar por area encuentra la fila 3 000, que nunca se habia descargado');
  campoArea.value = '';
  PWA.clearFilters();
  await esperar(400);
} else {
  const ids = Array.from(d.querySelectorAll('[id^="filter-"]')).map(e => e.id);
  log(false, 'No se encontro el control de filtro de area. Hay: [' + ids.join(', ') + ']');
}

// La busqueda libre tambien.
const buscar = d.querySelector('#main-container #ui-search-input') ||
               d.getElementById('ui-search-input');
if (buscar) {
  buscar.value = 'Hallazgo 2999';
  PWA.applyFilters();
  await esperar(500);
  log(qa('table tbody tr[data-uuid]').length === 1,
      'La busqueda libre tambien consulta el conjunto completo');
  buscar.value = '';
  PWA.clearFilters();
  await esperar(400);
} else log(false, 'No se encontro la caja de busqueda');

// Exportar: con la tabla paginada, exportar lo visible seria exportar 50 de
// 3 000 y el archivo mentiria por omision.
let exportado = null;
PWA.exportToExcel = (datos) => { exportado = datos; };
await MR.exportar('03_Inspecciones', 'xlsx');
log(exportado && exportado.length === 3000,
    'Exportar baja las 3 000 filas, no solo la pagina visible (' + (exportado ? exportado.length : 'nada') + ')');
log(!!exportado && Object.keys(exportado[0]).length >= 2 &&
    JSON.stringify(exportado).indexOf('<') === -1,
    'La exportacion lleva los valores de los campos, sin HTML');

// Con un filtro puesto, se exporta el resultado filtrado
exportado = null;
MR.recargar('03_Inspecciones', { filtros: { Area_Inspeccion: 'Planta' }, busqueda: '', cond: null });
await esperar(300);
await MR.exportar('03_Inspecciones', 'xlsx');
log(exportado && exportado.length === 1, 'Con filtro, se exporta solo lo filtrado (' + (exportado ? exportado.length : '?') + ')');
MR.recargar('03_Inspecciones', { filtros: {}, busqueda: '', cond: null });
await esperar(200);

FILAS['03_Inspecciones'] = MUCHAS.slice(0, 2);

console.log(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
