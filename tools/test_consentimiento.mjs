/**
 * tools/test_consentimiento.mjs - asistente de primer ingreso (CONSENTIMIENTO)
 * =========================================================================
 * Carga el bundle real (dist/index.html) en jsdom y comprueba lo que, si se
 * rompe, nadie nota hasta que un trabajador no puede entrar o una constancia
 * se archiva en la carpeta equivocada:
 *
 *   1. A quien no ha firmado se le pide; a quien ya firmo, no.
 *   2. Al SuperAdmin (proveedor del servicio) nunca se le pide.
 *   3. No hay forma de saltarselo: sin datos, sin selfie, sin casilla o sin
 *      firma, el asistente no avanza.
 *   4. Al firmar, la constancia se guarda como <DNI>.pdf con la empresa de la
 *      persona, y la ficha queda sellada para no volver a pedirlo.
 *   5. Las correcciones del paso 1 se guardan junto con el sello.
 *
 *   npm i --no-save jsdom@24.1.3     (una sola vez)
 *   npm run test:consentimiento
 *
 * Ejecutarlo tras tocar Consentimiento.js.html, el guardado de constancias en
 * DataProvider.js.html o accGuardarConsentimiento_ en Code.gs.
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
const log = (b, m) => { b ? ok++ : fallos++; console.log((b ? '  ✔ ' : '  ✘ ') + m); };

const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://ejemplo.test/',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = () => {}; w.confirm = () => true;
    w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    // jsdom no implementa ni pause() ni la descarga por <a download>: son
    // ruido del entorno, no fallos del asistente.
    w.HTMLMediaElement.prototype.pause = function () {};
    w.HTMLAnchorElement.prototype.click = function () {};
    w.HTMLCanvasElement.prototype.getContext = () => ({
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, fillRect() {},
      drawImage() {}, scale() {}, translate() {}, setTransform() {}, closePath() {}, arc() {}, fill() {},
      set lineWidth(v) {}, set strokeStyle(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set fillStyle(v) {}
    });
    // El canvas de firma devuelve algo distinto del canvas en blanco solo
    // cuando la prueba lo marca como firmado (w.__firmado).
    w.HTMLCanvasElement.prototype.toDataURL = function () {
      return (w.__firmado && this.id === 'consent-firma') ? 'data:image/png;base64,FIRMA' : 'data:image/png;base64,VACIO';
    };
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

const esperar = (ms = 60) => new Promise(r => w.setTimeout(r, ms));

// ── Dobles de prueba ──────────────────────────────────────────────────────
const estado = { usuarios: [], consentGuardados: [], colaGuardada: [] };
w.__mock.read = async () => ({ status: 'OK', payload: estado.usuarios.slice() });
w.__mock.saveConsent = async (datos) => { estado.consentGuardados.push(datos); return { status: 'OK', ruta: 'drive:ABC/' + datos.dni + '.pdf' }; };
w.__mock.push = async (modulo, accion, datos) => { estado.colaGuardada.push({ modulo, datos }); return true; };

w.eval(`
  DataService.read        = () => window.__mock.read();
  DataService.saveConsent = (x) => window.__mock.saveConsent(x);
  DataService.update      = (m, f) => window.__mock.push(m, 'update', f);
  window.pushToQueue      = (m, a, f) => window.__mock.push(m, a, f);
  // html2pdf no existe en jsdom: se sustituye por un doble que entrega un
  // Blob, que es lo unico que el asistente necesita de el.
  window.html2pdf = function () {
    return { set() { return this; }, from() { return this; },
             outputPdf: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })) };
  };
  window.__ref = { C: CONSENTIMIENTO };
`);
const C = w.__ref.C;

const sesion = (u) => w.eval('AppState.User = ' + JSON.stringify(u) + ';');
const limpiar = () => {
  w.localStorage.clear();
  const prev = d.getElementById('consent-wizard');
  if (prev) prev.remove();
};
const wiz = () => d.getElementById('consent-wizard');
const siguiente = async () => { d.getElementById('consent-siguiente').click(); await esperar(120); };
const pasoVisible = () => (d.getElementById('consent-cuerpo') || {}).textContent || '';

const USUARIO = {
  UUID: 'u-1', DNI: '71000001', Nombre_Completo: 'Ana Quispe', Email: 'ana@acme.pe',
  Rol: 'Trabajador', Status: 'Activo', Area: 'Mina', Puesto: 'Operaria', Empresa: 'ACME Contratistas'
};
const SESION_TRABAJADOR = { DNI: '71000001', Nombre: 'Ana Quispe', Email: 'ana@acme.pe', Rol: 'Trabajador',
                            Token: 't', Status: 'Activo', EmpresaId: 'e1', EmpresaNombre: 'ACME Contratistas' };

console.log('\n── Disponibilidad');
log(!!C, 'CONSENTIMIENTO disponible en la pagina');
log(typeof C.pendiente === 'function' && typeof C.abrir === 'function', 'API: pendiente() y abrir()');
log(C.PARRAFOS.length >= 4 && /firma digital/i.test(C.TITULO), 'Texto legal cargado (' + C.PARRAFOS.length + ' parrafos)');

console.log('\n── A quien se le pide');
limpiar(); estado.usuarios = [USUARIO]; sesion(SESION_TRABAJADOR);
log(await C.pendiente() === true, 'Sin firmar: se le pide');

limpiar(); estado.usuarios = [Object.assign({}, USUARIO, { Consentimiento_Fecha: '2026-01-05 08:00:00' })];
log(await C.pendiente() === false, 'Ya firmado en la ficha: NO se le vuelve a pedir');

limpiar(); estado.usuarios = [USUARIO];
w.localStorage.setItem('pwa_consent_71000001', '2026-01-05');
log(await C.pendiente() === false, 'Firmado en este equipo: se resuelve sin consultar al servidor');

limpiar(); estado.usuarios = [USUARIO];
sesion(Object.assign({}, SESION_TRABAJADOR, { Rol: 'SuperAdmin' }));
log(await C.pendiente() === false, 'Al SuperAdmin (proveedor del servicio) nunca se le pide');

limpiar(); estado.usuarios = [];
sesion(SESION_TRABAJADOR);
log(await C.pendiente() === false, 'Si no se pudo leer la ficha NO se bloquea la app');

console.log('\n── El asistente no se puede saltar');
limpiar(); estado.usuarios = [USUARIO]; sesion(SESION_TRABAJADOR);
await C.abrir(); await esperar(150);
log(!!wiz(), 'El asistente se abre');
log(!wiz().querySelector('[data-cerrar]'), 'No tiene boton de cerrar: la unica salida es firmar o cerrar sesion');
log(!!d.getElementById('consent-salir'), 'Ofrece cerrar sesion');
log(/Verifica tus datos/i.test(pasoVisible()), 'Empieza por verificar los datos');
log(d.getElementById('consent-dni').value === '71000001' && d.getElementById('consent-dni').readOnly,
    'El DNI se muestra pero no se puede cambiar aqui');
log(d.getElementById('consent-area').value === 'Mina', 'Trae los datos que ya existian en la ficha');

d.getElementById('consent-nombre').value = 'An';
await siguiente();
log(/Verifica tus datos/i.test(pasoVisible()), 'Nombre incompleto: no avanza');

d.getElementById('consent-nombre').value = 'Ana Maria Quispe';
d.getElementById('consent-email').value = 'correo-malo';
await siguiente();
log(/Verifica tus datos/i.test(pasoVisible()), 'Correo invalido: no avanza');

d.getElementById('consent-email').value = 'ana.quispe@acme.pe';
d.getElementById('consent-puesto').value = 'Operadora de equipo';
await siguiente();
log(/Foto de verificacion|Foto de verificaci/i.test(pasoVisible()), 'Con datos correctos pasa a la selfie');

await siguiente();
log(/Foto de verificaci/i.test(pasoVisible()), 'Sin selfie: no avanza');

C._selfie = 'data:image/jpeg;base64,SELFIE';
await siguiente();
log(/Lee y firma/i.test(pasoVisible()), 'Con selfie pasa a la firma');

await siguiente();
log(/Lee y firma/i.test(pasoVisible()), 'Sin marcar la casilla: no firma');

d.getElementById('consent-acepto').checked = true;
await siguiente();
log(/Lee y firma/i.test(pasoVisible()) && estado.consentGuardados.length === 0, 'Casilla marcada pero sin firma dibujada: no firma');

console.log('\n── Firma completa');
w.__firmado = true;
await siguiente();
await esperar(400);

const guardado = estado.consentGuardados[0];
log(estado.consentGuardados.length === 1, 'Se guarda exactamente una constancia');
log(!!guardado && guardado.dni === '71000001', 'Se archiva con el DNI de la persona: ' + (guardado ? guardado.dni : '—'));
log(!!guardado && guardado.empresa === 'ACME Contratistas', 'Y bajo su empresa: ' + (guardado ? guardado.empresa : '—'));
log(!!guardado && /^CONS-71000001-/.test(guardado.folio || ''), 'Lleva folio de verificacion: ' + (guardado ? guardado.folio : '—'));
log(!!guardado && guardado.blob && guardado.blob.type === 'application/pdf', 'Lo que se sube es un PDF');

const sello = estado.colaGuardada.find(x => x.modulo === '01_Usuarios');
log(!!sello, 'La ficha se sella para no volver a pedirlo');
log(!!sello && !!sello.datos.Consentimiento_Fecha && sello.datos.Consentimiento_Folio === guardado.folio,
    'El sello lleva fecha y el mismo folio que el PDF');
log(!!sello && /^drive:/.test(sello.datos.Consentimiento_Path || ''), 'Y donde quedo archivado');
log(!!sello && sello.datos.Nombre_Completo === 'Ana Maria Quispe' && sello.datos.Puesto === 'Operadora de equipo',
    'Las correcciones del paso 1 se guardan con el sello');
log(!wiz(), 'El asistente se cierra solo al terminar');
log(w.localStorage.getItem('pwa_consent_71000001') !== null, 'Queda el candado local');

estado.usuarios = [Object.assign({}, USUARIO, { Consentimiento_Fecha: sello ? sello.datos.Consentimiento_Fecha : 'x' })];
log(await C.pendiente() === false, 'Y ya nunca mas se le vuelve a pedir');

console.log('\nRESULTADO: ' + ok + ' correctas, ' + fallos + ' fallidas');
dom.window.close();
process.exit(fallos ? 1 : 0);
