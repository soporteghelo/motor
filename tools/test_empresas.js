/**
 * tools/test_empresas.js — pruebas del repartidor de empresas (Seed_Empresas.gs)
 * =========================================================================
 *   node tools/gen_appscript.js && node tools/test_empresas.js
 *   (o: npm run test:empresas)
 *
 * Siembra los datos de demostración sobre el simulador de Sheets, ejecuta
 * _AsignarEmpresas() y comprueba que el reparto es coherente, determinista y
 * que de verdad acota lo que ve cada Admin cuando entra por la API.
 * =========================================================================
 */
const fs = require('fs');
const path = require('path');
const { cargarCodeGs } = require('./gas_fake');

let ok = 0, fallos = 0;
const log = (c, m) => { c ? ok++ : fallos++; console.log((c ? '  ✔ ' : '  ✘ ') + m); };
const seccion = t => console.log('\n── ' + t);

const ROOT = path.join(__dirname, '..');
const env = cargarCodeGs(path.join(ROOT, '00_Config', 'Code.gs'));
const G = env.sandbox;
const api = req => JSON.parse(G.serverRouter(JSON.stringify(req)));

const raiz = env.nuevaCarpeta('SSOMA Empresas');
env.ejecutar(`CONFIG.ROOT_FOLDER_ID = '${raiz.getId()}'`);
env.ejecutar("CONFIG.SPREADSHEET_ID = ''");
G._CrearProyecto();

// Los dos scripts auxiliares viven en el mismo contexto que Code.gs, igual
// que en el editor de Apps Script.
env.ejecutar(fs.readFileSync(path.join(ROOT, '00_Config', 'Seed_Demo.gs'), 'utf8'));
env.ejecutar(fs.readFileSync(path.join(ROOT, '00_Config', 'Seed_Empresas.gs'), 'utf8'));
G._SembrarDatosDemo();

const ESQ = env.ejecutar('ESQUEMA');
const EMP = env.ejecutar('EMPRESAS');
const MODULOS = Object.keys(ESQ.modulos);
// Cada módulo guarda la empresa dueña en su propia columna ('Empresa', salvo
// 08_PETAR, que ya usa ese nombre para la contratista que ejecuta el trabajo).
const colEmp = id => ESQ.modulos[id].columnaEmpresa;

function filas(hoja) {
  env.ejecutar(`invalidarTabla_('${hoja}')`);
  const t = env.ejecutar(`leerTabla_('${hoja}')`);
  return t.filas
    .filter(f => f.some(v => String(v || '').trim()))
    .map(f => { const o = {}; t.headers.forEach((h, i) => { if (h) o[h] = String(f[i] == null ? '' : f[i]); }); return o; });
}
const personal = () => filas(ESQ.usuarios.hoja).filter(u => u.DNI);

seccion('Antes de repartir');
log(personal().every(u => !u.Empresa), 'Nadie tiene empresa todavía');
log(MODULOS.every(m => filas(ESQ.modulos[m].hoja).every(r => !r[colEmp(m)])), 'Ningún registro está etiquetado');

seccion('_AsignarEmpresas()');
G._AsignarEmpresas();
const gente = personal();
const conEmpresa = gente.filter(u => u.Empresa);
log(conEmpresa.length > 0, conEmpresa.length + ' de ' + gente.length + ' personas recibieron empresa');
log(conEmpresa.every(u => EMP.LISTA.indexOf(u.Empresa) !== -1), 'Todas las empresas asignadas salen de EMPRESAS.LISTA');

// Las cuentas protegidas se quedan fuera a propósito
log(gente.filter(u => EMP.SIN_EMPRESA_DNI.indexOf(u.DNI) !== -1).every(u => !u.Empresa),
    'Las cuentas de SIN_EMPRESA_DNI quedan sin empresa (siguen viendo todo)');

// Coherencia del reparto
const titular = EMP.LISTA[0];
const admins = gente.filter(u => normaliza(u.Rol) === 'admin' && EMP.SIN_EMPRESA_DNI.indexOf(u.DNI) === -1);
log(admins.length > 0 && admins.every(u => u.Empresa === titular), 'Los Admin van a la empresa titular');
const porEmpresa = {};
conEmpresa.forEach(u => {
  porEmpresa[u.Empresa] = porEmpresa[u.Empresa] || { sup: 0, tra: 0 };
  if (normaliza(u.Rol) === 'supervisor') porEmpresa[u.Empresa].sup++;
  if (normaliza(u.Rol) === 'trabajador') porEmpresa[u.Empresa].tra++;
});
log(EMP.LISTA.every(e => porEmpresa[e] && porEmpresa[e].sup >= 1),
    'Cada empresa tiene al menos un Supervisor que revise lo suyo');
const cuadrillas = EMP.LISTA.map(e => (porEmpresa[e] || { tra: 0 }).tra);
log(Math.max.apply(null, cuadrillas) - Math.min.apply(null, cuadrillas) <= 1,
    'Las cuadrillas quedan parejas (' + cuadrillas.join('/') + ' trabajadores)');

seccion('Etiquetado de los registros existentes');
let totalEtiquetados = 0, totalRegistros = 0;
MODULOS.forEach(m => {
  const rs = filas(ESQ.modulos[m].hoja).filter(r => r.UUID);
  totalRegistros += rs.length;
  totalEtiquetados += rs.filter(r => r[colEmp(m)]).length;
});
log(totalEtiquetados === totalRegistros && totalRegistros > 0,
    'Los ' + totalRegistros + ' registros quedaron etiquetados');
const coherente = MODULOS.every(m => {
  const empDe = {};
  personal().forEach(u => { empDe[u.DNI] = u.Empresa; });
  return filas(ESQ.modulos[m].hoja).filter(r => r.UUID)
    .every(r => r[colEmp(m)] === empDe[r.Creado_Por_DNI]);
});
log(coherente, 'La empresa de cada registro es la de quien lo creó');

// 08_PETAR: su campo Empresa propio no se toca
const petar = filas('08_PETAR').filter(r => r.UUID);
log(colEmp('08_PETAR') === 'Empresa_Registro' && MODULOS.filter(m => m !== '08_PETAR').every(m => colEmp(m) === 'Empresa'),
    'Los módulos usan la columna Empresa; solo 08_PETAR usa Empresa_Registro');
log(petar.every(r => !r.Empresa || r.Empresa !== r.Empresa_Registro),
    'PETAR conserva su campo Empresa propio, distinto de Empresa_Registro');
log(petar.some(r => r.Empresa), 'Y ese campo sigue teniendo valor (' + (petar[0] || {}).Empresa + ')');

seccion('Repetir no duplica ni cambia nada');
const antes = JSON.stringify(personal().map(u => u.DNI + '=' + u.Empresa));
G._AsignarEmpresas();
log(JSON.stringify(personal().map(u => u.DNI + '=' + u.Empresa)) === antes, 'Segunda ejecución: reparto idéntico');

seccion('Lo puesto a mano se respeta');
const tU = env.ejecutar(`leerTabla_('${ESQ.usuarios.hoja}')`);
env.ejecutar(`invalidarTabla_('${ESQ.usuarios.hoja}'); (function(){ const t = leerTabla_('${ESQ.usuarios.hoja}'); const i = buscarFila_(t, 'DNI', '71000040'); actualizarFila_(t, i, { Empresa: 'Empresa Puesta A Mano' }); })()`);
G._AsignarEmpresas();
log(personal().find(u => u.DNI === '71000040').Empresa === 'Empresa Puesta A Mano', 'No pisa una empresa escrita a mano');

seccion('Efecto real: cada Admin ve solo lo suyo');
// Se asciende a Admin a un supervisor de una contratista y se comprueba el corte
const contratista = EMP.LISTA[1];
const supCon = personal().find(u => u.Empresa === contratista && normaliza(u.Rol) === 'supervisor');
env.ejecutar(`(function(){ invalidarTabla_('${ESQ.usuarios.hoja}'); const t = leerTabla_('${ESQ.usuarios.hoja}'); const i = buscarFila_(t, 'DNI', '${supCon.DNI}'); actualizarFila_(t, i, { Rol: 'Admin' }); })()`);
const tok = api({ action: 'LOGIN_AUTH', userDNI: supCon.DNI, password: env.ejecutar('DEMO').PASSWORD }).userData.SessionToken;
const vistos = api({ action: 'READ_DB', moduleName: '04_Actos_Condiciones', userToken: tok }).payload;
log(vistos.length > 0, 'El Admin de ' + contratista + ' ve ' + vistos.length + ' registro(s)');
log(vistos.every(r => r.empresa_registro === contratista),
    '…y TODOS son de su empresa (el backend publica el alias empresa_registro)');
const todosLos = filas('04_Actos_Condiciones').filter(r => r.UUID).length;
log(vistos.length < todosLos, '…que son menos que los ' + todosLos + ' que hay en la hoja');

seccion('_QuitarEmpresas() deshace');
G._QuitarEmpresas();
log(personal().every(u => !u.Empresa), 'Nadie queda con empresa');
log(MODULOS.every(m => filas(ESQ.modulos[m].hoja).every(r => !r[colEmp(m)])), 'Ningún registro queda etiquetado');
log(filas('08_PETAR').filter(r => r.UUID).some(r => r.Empresa), 'Pero el campo Empresa de PETAR sigue intacto');
const trasQuitar = api({ action: 'READ_DB', moduleName: '04_Actos_Condiciones', userToken: tok }).payload;
log(trasQuitar.length === todosLos, 'Y ese Admin vuelve a verlo todo (' + trasQuitar.length + ')');

function normaliza(rol) { return String(rol || '').trim().toLowerCase(); }

console.log(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
