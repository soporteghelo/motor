/**
 * tools/test_permisos.js — visibilidad de módulos por plan y por rol
 * =========================================================================
 * Carga los subconfigs reales y PERMISOS en un contexto aislado y comprueba
 * el descubrimiento de módulos, el plan de la empresa y la matriz de
 * visibilidad que configura el Admin. Comprueba además que todos los
 * <script> del bundle compilan.
 *
 *   npm run test:permisos
 * =========================================================================
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || path.join(__dirname, '..');
let ok = 0, ko = 0;
const log = (b, m) => { b ? ok++ : ko++; console.log((b ? '  ✔ ' : '  ✘ ') + m); };

// 1. Sintaxis de cada <script> inline del bundle de producción
const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
let malos = 0;
scripts.forEach((src, i) => { try { new vm.Script(src); } catch (e) { malos++; console.log('    script #' + i + ': ' + e.message); } });
log(malos === 0, 'Sintaxis: ' + scripts.length + ' scripts inline del bundle compilan');

// 2. Entorno mínimo + subconfigs + Permisos
const ctx = { console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { querySelectorAll: () => [], getElementById: () => null } };
ctx.window = ctx; vm.createContext(ctx);
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
const subs = fs.readdirSync(ROOT).filter(d => /^\d\d_/.test(d)).map(d => {
  const f = fs.readdirSync(path.join(ROOT, d)).find(x => /^subconfig_.*\.js\.html$/.test(x));
  return f ? path.join(d, f) : null;
}).filter(Boolean).concat(['00_Config/001_Configuraciones/subconfig_04_Configuraciones.js.html']);
subs.forEach(f => vm.runInContext(leer(f), ctx));
vm.runInContext(leer('00_Config/Permisos.js.html') + ';this.PERMISOS=PERMISOS;', ctx);
const P = ctx.PERMISOS;
const sesion = (u) => { ctx.AppState = { User: u }; vm.runInContext('var AppState = this.AppState;', ctx); P._cacheModulos = null; };

sesion({ Rol: 'Admin', DNI: '1' });
const mods = P.modulos().map(m => m.id);
log(mods.length === 9 && mods.indexOf('01_Usuarios') === -1 && mods.indexOf('04_Configuraciones') === -1,
  'Registro automático: ' + mods.length + ' módulos de trabajo, sin transversales');
log(P.modulos().find(m => m.id === '07_IPERC').usadoPor.indexOf('Permisos de Alto Riesgo') !== -1, 'Detecta que PETAR usa IPERC (REF)');

const cfg = { Modulos_Visibles: { '10_Charlas': { trabajador: false }, '07_IPERC': { admin: false, supervisor: 'false' } } };
sesion({ Rol: 'Trabajador', DNI: '3', EmpresaConfig: cfg });
log(!P.moduloVisible('10_Charlas'), 'Trabajador: Charlas oculto por el Admin');
log(P.moduloVisible('08_PETAR'), 'Trabajador: PETAR sigue visible');
log(/ocultó/.test(P.motivoBloqueo('10_Charlas')), 'Mensaje de bloqueo explica que lo ocultó el Admin');
sesion({ Rol: 'Supervisor', DNI: '2', EmpresaConfig: cfg });
log(P.moduloVisible('10_Charlas') && !P.moduloVisible('07_IPERC'), 'Supervisor: ve Charlas, no IPERC ("false" en texto también cuenta)');
sesion({ Rol: 'Admin', DNI: '1', EmpresaConfig: cfg });
log(!P.moduloVisible('07_IPERC') && P.moduloVisible('01_Usuarios') && P.moduloVisible('04_Configuraciones'), 'Admin: IPERC oculto; Usuarios y Configuración nunca se ocultan');
sesion({ Rol: 'SuperAdmin', DNI: '9', EmpresaConfig: cfg, EmpresaModulos: { '03_Inspecciones': true } });
log(P.moduloVisible('07_IPERC') && P.moduloVisible('10_Charlas'), 'SuperAdmin ignora visibilidad y plan');
sesion({ Rol: 'Admin', DNI: '1', EmpresaModulos: { '03_Inspecciones': true, '08_PETAR': false } });
log(P.moduloVisible('03_Inspecciones') && !P.moduloVisible('08_PETAR') && !P.moduloVisible('09_EPP'), 'Plan: contratado sí; false o ausente no');
log(/plan/.test(P.motivoBloqueo('09_EPP')), 'Mensaje de bloqueo por plan');
log(P.moduloVisible('01_Usuarios'), 'Plan: transversales siempre disponibles');
sesion({ Rol: 'Trabajador', DNI: '3', EmpresaModulos: {} });
log(P.moduloVisible('09_EPP') && !P.moduloVisible('00_Admin'), 'Plan vacío = todo; 00_Admin cerrado al Trabajador');

console.log('\nRESULTADO: ' + ok + ' correctas, ' + ko + ' fallidas');
process.exit(ko ? 1 : 0);
