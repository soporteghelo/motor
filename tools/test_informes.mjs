/**
 * tools/test_informes.mjs — el informe PDF de cada registro
 * =========================================================================
 * Carga el bundle real (dist/index.html) en un DOM de verdad (jsdom) y
 * comprueba las cuatro cosas que tienen que cumplirse en TODOS los módulos:
 *
 *   1. El PDF se ve DENTRO de la app y se puede cerrar (antes se abría en una
 *      ventana a pantalla completa sin forma de volver al registro).
 *   2. Al sincronizar un registro se archiva su informe; al cambiarlo se
 *      vuelve a archivar en el MISMO sitio (no se acumulan copias).
 *   3. Al eliminar el registro principal se borra su informe.
 *   4. El informe se puede enviar por WhatsApp: adjunto si el dispositivo
 *      sabe compartir archivos, y si no su enlace.
 *
 *   npm i --no-save jsdom@24.1.3     (una sola vez)
 *   npm run test:informes
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

const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const abiertas = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://ejemplo.test/',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {};
    w.print = () => { w.__impreso = (w.__impreso || 0) + 1; };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = () => {}; w.confirm = () => true;
    // Cualquier intento de abrir una ventana nueva se registra: el visor NO
    // debe usar window.open (es justo el error que se corrigió).
    w.open = (url) => { abiertas.push(String(url || '')); return null; };
    w.HTMLCanvasElement.prototype.getContext = () => ({
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, fillRect() {},
      drawImage() {}, scale() {}, setTransform() {}, closePath() {}, arc() {}, fill() {},
      set lineWidth(v) {}, set strokeStyle(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set fillStyle(v) {}
    });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,BLANCO';
    w.indexedDB = { open: () => { const r = {}; setTimeout(() => r.onerror && r.onerror({ target: { error: 'sin indexedDB' } }), 0); return r; },
                    deleteDatabase: () => ({}) };
    w.tailwind = { config: {} };
    w.__mock = {};
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
      get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true
    });
  }
});

const w = dom.window, d = w.document;
await new Promise(r => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });

// ── Dobles de prueba ─────────────────────────────────────────────────────
const REGISTRO = {
  UUID: 'INS-7', Fecha_Peru: '2026-03-04', Auditor_DNI: '22222222',
  Area_Inspeccion: 'Mina', Tipo_Hallazgo: 'Acto subestándar',
  Descripcion_Tecnica: 'Pasillo obstruido <script>alert(1)</script>',
  Estado_Actual: 'Abierto', Responsable: 'Ana Quispe', Plazo: '2026-03-20',
  Evidencia_Fotos: 'https://ejemplo.test/foto.png', Firma_Digital: ''
};
const HIJOS = [{ PARENT_UUID: 'INS-7', Hallazgo: 'Caja en el pasillo', Riesgo: 'Golpe', Recomendacion: 'Retirar' }];

w.__mock.subidos = [];     // saveReport
w.__mock.borrados = [];    // deleteReport
w.__mock.eliminados = [];  // delete del registro
w.__mock.infoInforme = { existe: false };
w.__mock.respuestaSubida = { status: 'OK', ruta: 'e1/03_Inspecciones/INS-7/informe.pdf', donde: 'Storage' };
w.__mock.compartido = [];  // navigator.share
w.__mock.whatsapp = [];    // wa.me

// html2pdf no funciona en jsdom (necesita canvas de verdad): se sustituye por
// un doble que devuelve un PDF de mentira. Lo que esta prueba verifica es el
// FLUJO —cuándo se genera, dónde se archiva, qué se envía—, no el dibujo.
w.eval(`
  window.__ultimoHost = null;
  window.html2pdf = function () {
    return {
      set() { return this; },
      from(el) { window.__ultimoHost = el; return this; },
      outputPdf() { return Promise.resolve(new Blob(['%PDF-falso'], { type: 'application/pdf' })); }
    };
  };
  DataService.query = (m, o) => Promise.resolve({ status: 'OK', payload: [window.__mock.registro], total: 1 });
  DataService.readChildren = () => Promise.resolve(window.__mock.hijos);
  DataService.resolveMedia = (v) => Promise.resolve(v);
  DataService.saveReport = (datos) => {
    window.__mock.subidos.push({ modulo: datos.modulo, uuid: datos.uuid, bytes: datos.blob ? datos.blob.size : 0 });
    return Promise.resolve(window.__mock.respuestaSubida);
  };
  DataService.deleteReport = (m, u) => { window.__mock.borrados.push(m + '/' + u); return Promise.resolve({ status: 'OK' }); };
  DataService.reportInfo = () => Promise.resolve(window.__mock.infoInforme);
  DataService.provider.delete = (m, u) => { window.__mock.eliminados.push(m + '/' + u); return Promise.resolve({ status: 'OK' }); };
  PWA_SKILLS.abrirWhatsApp = (tel, texto) => { window.__mock.whatsapp.push(texto); };
  PWA_SKILLS.toast = (msg, tipo) => { (window.__mock.avisos = window.__mock.avisos || []).push(tipo + ': ' + msg); };
  AppState.User = { DNI: '11111111', Nombre: 'Ana Quispe', Rol: 'Admin', Token: 't', Status: 'Activo',
                    EmpresaId: 'e1', EmpresaNombre: 'Minera Demo' };
  window.__ref = { PDF: PDF_TEMPLATE, MR: MOTOR_RENDER, DS: DataService, AppState: AppState };
`);
w.__mock.registro = REGISTRO;
w.__mock.hijos = HIJOS;

const PDF = w.__ref.PDF, MR = w.__ref.MR, DS = w.__ref.DS;
const esperar = (ms = 40) => new Promise(r => w.setTimeout(r, ms));
const visor = () => d.getElementById('pt-visor');

// =========================================================================
seccion('El PDF se ve dentro de la app y se puede cerrar');

const abierto = await PDF.exportarRegistro('03_Inspecciones', 'INS-7', 'Mina · 04/03/2026');
log(abierto === true, 'exportarRegistro abre el visor');
log(abiertas.length === 0, 'NO se abre ninguna ventana nueva (' + abiertas.length + ' intentos)');
log(!!visor(), 'El visor existe en el DOM de la app');
log(visor() && visor().getAttribute('role') === 'dialog' && visor().getAttribute('aria-modal') === 'true',
    'Es un diálogo accesible (role + aria-modal)');

const volver = visor() && visor().querySelector('[data-cerrar]');
log(!!volver && (volver.getAttribute('aria-label') || '').toLowerCase().includes('volver'),
    'Tiene un botón de volver con etiqueta accesible');
['imprimir', 'descargar', 'whatsapp'].forEach(a =>
  log(!!visor().querySelector('[data-' + a + ']'), 'Tiene la acción "' + a + '"'));

const cuerpo = visor().querySelector('.pt-doc');
log(!!cuerpo && cuerpo.textContent.includes('Pasillo obstruido'), 'El documento lleva los datos del registro');
log(!!cuerpo && cuerpo.textContent.includes('Caja en el pasillo'), 'Y las filas de la tabla hija');
log(cuerpo.querySelectorAll('script').length === 0 && cuerpo.innerHTML.includes('&lt;script&gt;'),
    'Un dato con HTML dentro se escapa, no se ejecuta');

const hoja = d.getElementById('pt-estilos');
log(!!hoja, 'Los estilos del documento se inyectan una sola vez');
log(hoja && !/(^|\})\s*body\s*\{/.test(hoja.textContent) && hoja.textContent.includes('.pt-doc'),
    'Van acotados a .pt-doc: no se escapan a la app');
log(hoja && hoja.textContent.includes('@media print') && hoja.textContent.includes('#pt-visor'),
    'Al imprimir se oculta la app y sale solo la hoja');

visor().querySelector('[data-imprimir]').click();
log(w.__impreso === 1, 'Imprimir usa el diálogo del sistema (Guardar como PDF)');

volver.click();
log(!visor(), 'El botón de volver cierra el visor');

await PDF.exportarRegistro('03_Inspecciones', 'INS-7');
log(!!visor(), 'Se vuelve a abrir');
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
log(!visor(), 'Escape también lo cierra');

await PDF.exportarRegistro('03_Inspecciones', 'INS-7');
w.dispatchEvent(new w.Event('popstate'));
log(!visor(), 'El botón físico de atrás del teléfono lo cierra (popstate)');

// Registro que no existe: no se inventa un documento
w.__mock.registro = null;
const sinRegistro = await PDF.exportarRegistro('03_Inspecciones', 'NO-EXISTE');
log(sinRegistro === null && !visor(), 'Un registro que no existe NO genera documento');
log((w.__mock.avisos || []).some(a => a.startsWith('error:')), 'Y se explica por qué');
w.__mock.registro = REGISTRO;

// =========================================================================
seccion('Se archiva al sincronizar y se vuelve a archivar en cada cambio');

w.localStorage.removeItem(PDF.CLAVE_PENDIENTES);
log(PDF.archivoAutomatico() === true, 'El archivo automático está activo por defecto');

PDF.encolarArchivo('03_Inspecciones', ['INS-7']);
log(PDF._pendiente('03_Inspecciones', 'INS-7'), 'Guardar un registro lo deja pendiente de archivar');

let res = await PDF.procesarPendientes();
log(res.archivados === 1 && res.pendientes === 0, 'Se archiva y sale de la lista');
log(w.__mock.subidos.length === 1 && w.__mock.subidos[0].uuid === 'INS-7' &&
    w.__mock.subidos[0].modulo === '03_Inspecciones', 'Se sube el PDF de ESE registro');
log(w.__mock.subidos[0].bytes > 0, 'Y el archivo subido no está vacío');
log(!!w.__ultimoHost && w.__ultimoHost.className.includes('pt-doc'), 'El PDF se genera del documento real');
log(!d.querySelector('body > div[style*="-10000px"]'), 'La hoja oculta se retira del DOM tras generar');

// Un cambio en el registro vuelve a archivar el MISMO archivo
PDF.encolarArchivo('03_Inspecciones', ['INS-7']);
res = await PDF.procesarPendientes();
log(res.archivados === 1 && w.__mock.subidos.length === 2, 'Editar el registro vuelve a archivar su informe');
log(w.__mock.subidos[1].uuid === w.__mock.subidos[0].uuid,
    'Es el mismo informe del mismo registro (se sustituye, no se acumula)');

// Sin señal: el pendiente no se pierde ni gasta intentos
w.__mock.respuestaSubida = { status: 'ERROR', msg: 'sin conexión', transitorio: true };
PDF.encolarArchivo('03_Inspecciones', ['INS-9']);
res = await PDF.procesarPendientes();
log(res.archivados === 0 && PDF._pendiente('03_Inspecciones', 'INS-9'),
    'Un fallo de red deja el informe pendiente (no se pierde)');
const guardadas = JSON.parse(w.localStorage.getItem(PDF.CLAVE_PENDIENTES));
log(guardadas.every(p => (p.n || 0) === 0), 'Y no gasta intentos: el registro no fue rechazado');
log(guardadas.length > 0, 'La lista sobrevive en localStorage al cierre de la app');

// Rechazo real: se reintenta un número acotado de veces y se descarta
w.__mock.respuestaSubida = { status: 'ERROR', msg: 'sin permiso' };
for (let i = 0; i < PDF.MAX_INTENTOS; i++) await PDF.procesarPendientes({ tope: 1 });
log(!PDF._pendiente('03_Inspecciones', 'INS-9'),
    'Un rechazo real se reintenta ' + PDF.MAX_INTENTOS + ' veces y se descarta (no bloquea la lista)');
w.__mock.respuestaSubida = { status: 'OK', ruta: 'e1/03_Inspecciones/INS-7/informe.pdf', donde: 'Storage' };

// La cola de sincronización es quien lo apunta
log(typeof w.archivarInformesPendientes === 'function',
    'La cola offline tiene el enganche que archiva tras subir (archivarInformesPendientes)');

// =========================================================================
seccion('Al eliminar el registro principal se borra su informe');

w.localStorage.removeItem(PDF.CLAVE_PENDIENTES);
PDF.encolarArchivo('03_Inspecciones', ['INS-7']);
const rb = await DS.delete('03_Inspecciones', 'INS-7');
await esperar(20);
log(rb.status === 'OK' && w.__mock.eliminados[0] === '03_Inspecciones/INS-7', 'Se elimina el registro');
log(w.__mock.borrados[0] === '03_Inspecciones/INS-7', 'Y se borra su informe archivado');
log(!PDF._pendiente('03_Inspecciones', 'INS-7'), 'Y se olvida el archivo pendiente (ya no hay registro)');

w.eval(`DataService.provider.delete = () => Promise.resolve({ status: 'ERROR', msg: 'sin permiso' });`);
w.__mock.borrados.length = 0;
const rf = await DS.delete('03_Inspecciones', 'INS-8');
log(rf.status === 'ERROR' && w.__mock.borrados.length === 0,
    'Si el servidor rechaza el borrado, el informe NO se toca');
w.eval(`DataService.provider.delete = (m, u) => { window.__mock.eliminados.push(m + '/' + u); return Promise.resolve({ status: 'OK' }); };`);

// =========================================================================
seccion('Envío por WhatsApp');

// 1 · El dispositivo sabe compartir archivos → va el PDF adjunto
Object.defineProperty(w.navigator, 'share', {
  configurable: true,
  value: (datos) => { w.__mock.compartido.push(datos); return Promise.resolve(); }
});
Object.defineProperty(w.navigator, 'canShare', { configurable: true, value: () => true });
await PDF.enviarPorWhatsApp('03_Inspecciones', 'INS-7', 'Mina · 04/03/2026');
log(w.__mock.compartido.length === 1, 'Se usa el compartir del sistema (donde está WhatsApp)');
const env = w.__mock.compartido[0];
log(!!env && Array.isArray(env.files) && env.files.length === 1 && env.files[0].type === 'application/pdf',
    'Y lo que se manda es el PDF como ADJUNTO');
log(/\.pdf$/.test(env.files[0].name), 'Con nombre de archivo PDF: ' + env.files[0].name);

// 2 · No sabe compartir archivos (WebView del APK) → enlace del archivado
Object.defineProperty(w.navigator, 'canShare', { configurable: true, value: () => false });
w.__mock.infoInforme = { existe: true, enlace: 'https://drive.google.com/file/d/ABC/view', donde: 'Drive' };
await PDF.enviarPorWhatsApp('03_Inspecciones', 'INS-7', 'Mina · 04/03/2026');
log(w.__mock.whatsapp.length === 1, 'Se abre WhatsApp con el mensaje');
log(w.__mock.whatsapp[0].includes('https://drive.google.com/file/d/ABC/view'),
    'Y lleva el enlace del documento archivado');
log(/no lo reenvíes fuera de la empresa/i.test(w.__mock.whatsapp[0]),
    'El mensaje advierte que el enlace abre el documento a quien lo reciba');

// 3 · Ni adjunto ni enlace: se dice por qué, no se manda un mensaje vacío
w.__mock.infoInforme = { existe: false };
w.__mock.respuestaSubida = { status: 'ERROR', msg: 'sin conexión', transitorio: true };
w.__mock.whatsapp.length = 0;
(w.__mock.avisos || []).length = 0;
const r3 = await PDF.enviarPorWhatsApp('03_Inspecciones', 'INS-7', 'Mina');
log(r3 === false && w.__mock.whatsapp.length === 0, 'Sin documento no se abre WhatsApp');
log((w.__mock.avisos || []).some(a => /error:.*informe/i.test(a)), 'Y se explica qué hacer');

// =========================================================================
seccion('Todos los módulos reciben las dos acciones en su Detalle');

const MODULOS = w.eval('PERMISOS.modulos().map(m => m.id)');
for (const mod of MODULOS) {
  const h = MR.htmlDetalle(mod);
  const s = MR.slug(mod);
  log(h.includes(s + '-det-pdf') && h.includes(s + '-det-enviar'),
      mod + ': botones PDF y Enviar en la cabecera del Detalle');
}

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fallos + ' fallidas');
process.exit(fallos ? 1 : 0);
