/**
 * tools/test_rostro.mjs - pruebas de la captura facial (FACE_CAPTURE)
 * =========================================================================
 * Carga el bundle real (dist/index.html) en un DOM de verdad (jsdom) y
 * comprueba las tres cosas que pueden romperse sin que nadie se entere:
 *   1. Un campo con captura facial pinta su panel y su foto llega al guardado.
 *   2. Sin camara el formulario NO queda bloqueado (respaldo del telefono).
 *   3. Salir de la vista apaga la camara (nunca queda el led encendido).
 * Ademas prueba el camino real de hoy: la foto de perfil en 01_Usuarios.
 *
 *   npm i --no-save jsdom@24.1.3     (una sola vez)
 *   npm run test:rostro
 *
 * Ejecutarlo tras tocar Face_Capture.js.html, Motor_Render.js.html o la
 * Edicion de 01_Usuarios.
 * =========================================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(path.join(ROOT, 'node_modules/jsdom/lib/api.js')).href)); }
catch (e) {
  console.error('Falta jsdom. Instalalo sin tocar package.json:\n  npm i --no-save jsdom@24.1.3');
  process.exit(2);
}

let ok = 0, fallos = 0;
const log = (b, m) => { b ? ok++ : fallos++; console.log((b ? '  \u2714 ' : '  \u2718 ') + m); };

const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://ejemplo.test/',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = () => {}; w.confirm = () => true;
    w.HTMLCanvasElement.prototype.getContext = () => ({
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, fillRect() {},
      drawImage() {}, scale() {}, translate() {}, setTransform() {}, closePath() {}, arc() {}, fill() {},
      set lineWidth(v) {}, set strokeStyle(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set fillStyle(v) {}
    });
    w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,ROSTRO'; };
    w.indexedDB = { open: () => { const r = {}; setTimeout(() => r.onerror && r.onerror({ target: { error: 'x' } }), 0); return r; }, deleteDatabase: () => ({}) };
    w.tailwind = { config: {} };
    w.__mock = {};
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
      get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true
    });
  }
});
const w = dom.window, d = w.document;
await new Promise(r => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });

const FILAS = {};
const guardado = [];
w.__mock.read = async (m) => ({ status: 'OK', payload: (FILAS[m] || []).slice() });
w.__mock.push = async (modulo, accion, datos, hijos) => { guardado.push({ modulo, datos, hijos }); return true; };

w.eval(`
  DataService.read         = (m) => window.__mock.read(m);
  DataService.readChildren = () => Promise.resolve([]);
  DataService.resolveMedia = (v) => Promise.resolve(v);
  window.pushToQueue = (mo, a, dd, h) => window.__mock.push(mo, a, dd, h);
  window.pseudoGenerateUUID = () => 'UUID-PRUEBA';
  AppState.User = { DNI: '11111111', Nombre: 'Ana Quispe', Rol: 'Admin', Token: 't', Status: 'Activo', EmpresaId: 'e1' };
  AppState.Settings = AppState.Settings || {};
  window.__ref = { MR: MOTOR_RENDER, FC: FACE_CAPTURE };
`);
const MR = w.__ref.MR, FC = w.__ref.FC;
const esperar = (ms = 60) => new Promise(r => w.setTimeout(r, ms));
const q = s => d.getElementById('main-container').querySelector(s);
await esperar(400);

const MOD = '10_Charlas';
console.log('\n\u2500\u2500 Motor y globales');
log(!!FC, 'FACE_CAPTURE disponible en la página');
log(typeof FC.montar === 'function' && typeof FC.detenerTodas === 'function', 'API: montar() y detenerTodas()');

// Campo nuevo en caliente: así se probaría cualquier subconfig que lo declare
w.eval(`
  SUBCONFIG_10_CHARLAS.Variables['Foto_Verificacion'] = { type: 'Face_Photo', required: false };
  SUBCONFIG_10_CHARLAS.Vistas.Edicion.secciones[2].campos.push('Foto_Verificacion');
  MOTOR_RENDER._vcache = {};
`);

console.log('\n\u2500\u2500 Deducciones del subconfig');
log(MR.control('Foto_Verificacion', { type: 'Face_Photo' }) === 'rostro', 'type Face_Photo -> control "rostro"');
log(MR.control('Foto_Perfil', { type: 'Image', captura: 'rostro' }) === 'rostro', 'Image + captura:"rostro" -> control "rostro"');
log(MR.control('Foto_Perfil', { type: 'Image' }) === 'imagen', 'Image normal sigue siendo "imagen"');
log(MR.esArchivo({ type: 'Face_Photo' }), 'Face_Photo cuenta como campo de archivo');

FILAS[MOD] = [];
w.showView(MOD);
await esperar(200);
w.changeInternalView(MOD, 'Edicion');
await esperar(500);

console.log('\n\u2500\u2500 Panel en la Edición');
const host = q('#' + MR.slug(MOD) + '-f-Foto_Verificacion');
log(!!host, 'El campo pinta su contenedor en el formulario');
log(!!host && !!host.querySelector('.fc-panel'), 'FACE_CAPTURE montó el panel dentro');
log(!!host && !!host.querySelector('video'), 'Hay elemento <video> para la cámara');
log(!!host && !!host.querySelector('.fc-ovalo'), 'Hay guía ovalada de encuadre');
log(!!host && !!host.querySelector('[role="status"]'), 'El mensaje de guía es una región aria-live');
const etq = host && host.parentElement && host.parentElement.querySelector('label');
log(!!etq && /verificacion/i.test(etq.textContent), 'Lleva su etiqueta visible: ' + (etq ? etq.textContent.trim() : '—'));

console.log('\n\u2500\u2500 Sin cámara disponible (jsdom no tiene getUserMedia)');
const aviso = host && host.querySelector('.fc-aviso');
log(!!aviso && /c.mara del tel/i.test(aviso.textContent), 'Ofrece salida en vez de romper: "' + (aviso ? aviso.textContent.trim() : '—') + '"');
log(!!aviso && aviso.className.indexOf('fc-warn') !== -1, 'El aviso usa un estado del sistema de diseño');
const resp = host && host.querySelector('.fc-btn[id$="-respaldo"]');
log(!!resp && resp.style.display === '', 'Aparece el botón de cámara del teléfono');
log(!!host.querySelector('input[type="file"][capture="user"]'), 'El respaldo usa la cámara frontal nativa');
log(!(q('.fc-panel video') || {}).srcObject, 'No queda ningún stream colgado');

console.log('\n\u2500\u2500 Captura simulada -> guardado');
const inst = FC._activas.find(i => i.contenedorId.indexOf('Foto_Verificacion') !== -1);
log(!!inst, 'La instancia queda registrada para poder apagarla');
if (inst) {
  inst.el.video.srcObject = null;
  // Se simula el disparo automático con un fotograma válido
  Object.defineProperty(inst.el.video, 'videoWidth',  { value: 640, configurable: true });
  Object.defineProperty(inst.el.video, 'videoHeight', { value: 480, configurable: true });
  inst.cerrado = false;
  FC._disparar(inst);
  await esperar(60);
  log(inst.dataUrl === 'data:image/jpeg;base64,ROSTRO', 'La foto se recorta y queda en la instancia');
  log(inst.el.camara.style.display === 'none', 'La cámara se oculta tras capturar');
  log(inst.el.foto.style.display !== 'none', 'Se muestra la foto con el sello de éxito');
  const guardadaEnMotor = (MR._archivos[MOD] || {}).Foto_Verificacion;
  log(!!guardadaEnMotor && guardadaEnMotor[0] === 'data:image/jpeg;base64,ROSTRO', 'MOTOR_RENDER la recibe como archivo del campo');
  const rec = MR.recolectar(MOD);
  log(rec.datos.Foto_Verificacion === 'data:image/jpeg;base64,ROSTRO', 'recolectar() la incluye en los datos a guardar');

  // Repetir
  inst.repetir();
  await esperar(60);
  log(!inst.dataUrl && !((MR._archivos[MOD] || {}).Foto_Verificacion), 'Repetir borra la foto anterior del campo');
}

console.log('\n\u2500\u2500 Apagado al salir de la vista');
w.showView('Menu');
await esperar(120);
log(FC._activas.length === 0, 'showView() apaga todas las cámaras (' + FC._activas.length + ' activas)');

// =========================================================================
console.log('\n\u2500\u2500 ' + 'Foto de perfil en 01_Usuarios (el uso real de hoy)');
FILAS['01_Usuarios'] = [{
  UUID: 'U-1', DNI: '11111111', Nombre_Completo: 'Ana Quispe', Email: 'ana@ejemplo.test',
  Rol: 'Admin', Status: 'Activo', Empresa: 'Titular'
}];
w.showView('01_Usuarios');
await esperar(250);
w.changeInternalView('01_Usuarios', 'Edicion', 'CURRENT');
await esperar(300);

log(typeof w.abrirCapturaRostro === 'function', 'La Edicion expone abrirCapturaRostro()');
log(!!d.getElementById('usr-face-host'), 'Hay contenedor para el panel junto al avatar');
const botonAbrir = d.getElementById('usr-face-abrir');
log(!!botonAbrir && /tomar foto/i.test(botonAbrir.textContent), 'Hay boton "Tomar foto"');
log(!!botonAbrir && botonAbrir.className.indexOf('bg-primary') !== -1, 'El boton usa la accion primaria del tema (amarillo)');

w.abrirCapturaRostro();
await esperar(120);
log(!!d.querySelector('#usr-face-host .fc-panel'), 'Pulsar el boton monta el panel de camara');
log(d.getElementById('usr-face-cerrar').style.display === '', 'Aparece "Cerrar camara"');

const instPerfil = FC._activas.find(i => i.contenedorId === 'usr-face-host');
log(!!instPerfil, 'La camara del perfil queda registrada');
if (instPerfil) {
  Object.defineProperty(instPerfil.el.video, 'videoWidth',  { value: 640, configurable: true });
  Object.defineProperty(instPerfil.el.video, 'videoHeight', { value: 480, configurable: true });
  instPerfil.cerrado = false;
  FC._disparar(instPerfil);
  await esperar(80);
  const avatar = d.getElementById('usr-photo-preview');
  log(avatar.src === 'data:image/jpeg;base64,ROSTRO', 'La foto capturada queda en el avatar del perfil');
  log(!avatar.classList.contains('hidden'), 'El avatar deja de estar oculto');
  log(d.getElementById('usr-photo-placeholder').style.display === 'none', 'Se retira el icono de "sin foto"');
}

w.cerrarCapturaRostro();
await esperar(60);
log(!d.querySelector('#usr-face-host .fc-panel'), 'Cerrar la camara vacia el panel');
log(!FC._activas.some(i => i.contenedorId === 'usr-face-host'), 'Y suelta la camara');

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fallos + ' fallidas');
process.exit(fallos ? 1 : 0);
