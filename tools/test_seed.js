/**
 * tools/test_seed.js — pruebas del sembrador de datos (00_Config/Seed_Demo.gs)
 * =========================================================================
 *   node tools/gen_appscript.js && node tools/test_seed.js
 *   (o: npm run test:seed)
 *
 * Ejecuta Seed_Demo.gs REAL sobre el mismo simulador de Sheets/Drive que usa
 * test_appscript.js. Comprueba que lo sembrado entra bien, que los valores
 * respetan los Enum de cada subconfig, que la app lo puede leer con sus
 * propias reglas de rol, y que _BorrarDatosDemo lo quita TODO sin tocar un
 * solo registro real.
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

// ── Proyecto base ────────────────────────────────────────────────────────
const raiz = env.nuevaCarpeta('SSOMA Demo');
env.ejecutar(`CONFIG.ROOT_FOLDER_ID = '${raiz.getId()}'`);
env.ejecutar("CONFIG.SPREADSHEET_ID = ''");   // el simulador crea su propia hoja
G._CrearProyecto();

// Seed_Demo.gs se carga en el MISMO contexto: así ve CONFIG, ESQUEMA y los
// ayudantes de Code.gs, igual que en el editor de Apps Script.
env.ejecutar(fs.readFileSync(path.join(ROOT, '00_Config', 'Seed_Demo.gs'), 'utf8'));

const ESQ = env.ejecutar('ESQUEMA');
const DEMO = env.ejecutar('DEMO');
const MODULOS = Object.keys(ESQ.modulos);

/** Lee una pestaña como objetos */
function filas(hoja) {
  env.ejecutar(`invalidarTabla_('${hoja}')`);
  const t = env.ejecutar(`leerTabla_('${hoja}')`);
  return t.filas
    .filter(f => f.some(v => String(v || '').trim()))
    .map(f => { const o = {}; t.headers.forEach((h, i) => { if (h) o[h] = String(f[i] == null ? '' : f[i]); }); return o; });
}

/** acceptedValues de un campo, leídos del subconfig real */
function enumDe(modulo, campo) {
  const dir = path.join(ROOT, modulo);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find(x => /^subconfig_.*\.js\.html$/.test(x));
  if (!f) return null;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = new RegExp('"' + campo + '"\\s*:\\s*\\{[^}]*?acceptedValues:\\s*\\[([^\\]]*)\\]');
  const m = src.match(re);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// =========================================================================
seccion('Sembrado');
const t0 = Date.now();
const r = G._SembrarDatosDemo();
const segundos = (Date.now() - t0) / 1000;
log(r && r.ok === true, 'La siembra termina sin error (' + segundos.toFixed(1) + ' s)');

const usuarios = filas(ESQ.usuarios.hoja);
const demoUsuarios = usuarios.filter(u => u.UUID.indexOf(DEMO.MARCA) === 0);
log(demoUsuarios.length === DEMO.USUARIOS, 'Crea ' + DEMO.USUARIOS + ' personas (' + demoUsuarios.length + ')');
log(usuarios.length === DEMO.USUARIOS + 1, 'El administrador que ya existía sigue ahí (' + usuarios.length + ' en total)');

MODULOS.forEach(id => {
  const m = ESQ.modulos[id];
  const p = filas(m.hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
  log(p.length === DEMO.FILAS_POR_MODULO, id + ': ' + p.length + ' registros');
  if (m.hojaHija) {
    const h = filas(m.hojaHija).filter(x => (x.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0);
    const padres = new Set(h.map(x => x.PARENT_UUID));
    log(h.length > 0 && padres.size > 0, id + ': ' + h.length + ' filas de detalle en ' + padres.size + ' registros');
  }
});

// =========================================================================
seccion('Las personas pueden entrar a la app');
const login1 = api({ action: 'LOGIN_AUTH', userDNI: '71000001', password: DEMO.PASSWORD });
log(login1.status === 'OK' && login1.userData.Rol === 'Admin', 'El 71000001 entra y es Admin');
const login2 = api({ action: 'LOGIN_AUTH', userDNI: '71000005', password: DEMO.PASSWORD });
log(login2.status === 'OK' && login2.userData.Rol === 'Supervisor', 'El 71000005 entra y es Supervisor');
const login3 = api({ action: 'LOGIN_AUTH', userDNI: '71000020', password: DEMO.PASSWORD });
log(login3.status === 'OK' && login3.userData.Rol === 'Trabajador', 'El 71000020 entra y es Trabajador');
log(api({ action: 'LOGIN_AUTH', userDNI: '71000039', password: DEMO.PASSWORD }).status === 'CESADO',
  'Una cuenta cesada no entra (hay 2 para probar el bloqueo)');
log(api({ action: 'LOGIN_AUTH', userDNI: '71000001', password: 'otracosa' }).status === 'ERROR',
  'Con otra contraseña no entra');

const dnis = demoUsuarios.map(u => u.DNI);
log(new Set(dnis).size === dnis.length, 'Los DNI no se repiten');
log(dnis.every(d => /^\d{8}$/.test(d)), 'Todos los DNI tienen 8 dígitos');

// =========================================================================
seccion('La app lee los datos con sus reglas de rol');
const tokAdmin = login1.userData.SessionToken;
const tokSup   = login2.userData.SessionToken;
const tokTrab  = login3.userData.SessionToken;

MODULOS.forEach(id => {
  const res = api({ action: 'READ_DB', moduleName: id, userToken: tokAdmin });
  log(res.status === 'OK' && res.payload.length === DEMO.FILAS_POR_MODULO,
    id + ': el Admin ve los ' + (res.payload ? res.payload.length : 0) + ' registros');
});

const petarSup  = api({ action: 'READ_DB', moduleName: '08_PETAR', userToken: tokSup });
const petarTrab = api({ action: 'READ_DB', moduleName: '08_PETAR', userToken: tokTrab });
log(petarSup.payload.length < DEMO.FILAS_POR_MODULO && petarSup.payload.length > 0,
  'El Supervisor ve solo lo suyo y donde figura (' + petarSup.payload.length + ' de ' + DEMO.FILAS_POR_MODULO + ')');
log(petarTrab.payload.length > 0 && petarTrab.payload.length < petarSup.payload.length,
  'El Trabajador ve los suyos y solo los suyos (' + petarTrab.payload.length + ')');

const unPetar = petarSup.payload[0];
const hijos = api({ action: 'READ_CHILDREN', moduleName: '08_PETAR', parentUuid: unPetar.UUID, userToken: tokSup });
log(hijos.status === 'OK' && hijos.payload.length > 0,
  'El detalle de un registro se lee por la API (' + (hijos.payload || []).length + ' verificaciones)');

// =========================================================================
seccion('Los valores respetan los Enum de cada subconfig');
const COMPROBAR = {
  '02_Reportes':          ['Categoria_Reporte', 'Nivel_Severidad'],
  '03_Inspecciones':      ['Area_Inspeccion', 'Tipo_Hallazgo', 'Estado_Actual'],
  '04_Actos_Condiciones': ['Area', 'Tipo_Reporte', 'Categoria', 'Nivel_Riesgo', 'Estado', 'Fuente'],
  '05_Incidentes':        ['Tipo_Evento', 'Gravedad', 'Severidad_Potencial', 'Area', 'Tipo_Personal', 'Estado', 'Parte_Afectada'],
  '06_Capacitaciones':    ['Tipo', 'Tema', 'Modalidad', 'Vigencia_Meses', 'Evaluacion', 'Estado'],
  '07_IPERC':             ['Tipo_IPERC', 'Area', 'Estado', 'Riesgo_Maximo'],
  '08_PETAR':             ['Tipo_Trabajo', 'Area', 'Estado'],
  '09_EPP':               ['Area', 'Tipo_Entrega', 'Estado'],
  '10_Charlas':           ['Categoria', 'Turno', 'Area', 'Estado']
};
let camposRevisados = 0, desviados = [];
Object.keys(COMPROBAR).forEach(id => {
  const datos = filas(ESQ.modulos[id].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
  COMPROBAR[id].forEach(campo => {
    const permitidos = enumDe(id, campo);
    if (!permitidos) return;
    camposRevisados++;
    const malos = [...new Set(datos.map(d => d[campo]).filter(v => v && permitidos.indexOf(v) === -1))];
    if (malos.length) desviados.push(id + '.' + campo + ' → ' + malos.join(' | '));
  });
});
log(desviados.length === 0,
  camposRevisados + ' campos Enum revisados contra su subconfig' + (desviados.length ? ': ' + desviados.join(' ; ') : ''));

// =========================================================================
seccion('Coherencia de los datos');
const petar = filas(ESQ.modulos['08_PETAR'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
log(petar.every(p => !p.Aprobado_Por || p.Aprobado_Por !== p.Creado_Por_DNI),
  'PETAR: nadie aprueba el permiso que él mismo solicitó');
const verif = filas(ESQ.modulos['08_PETAR'].hojaHija).filter(x => (x.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0);
const porPadre = {};
verif.forEach(v => { porPadre[v.PARENT_UUID] = (porPadre[v.PARENT_UUID] || 0) + 1; });
log(petar.every(p => String(porPadre[p.UUID] || 0) === p.Total_Controles),
  'PETAR: Total_Controles coincide con las filas de detalle');
const noCumple = {};
verif.forEach(v => { if (v.Cumple === 'No') noCumple[v.PARENT_UUID] = (noCumple[v.PARENT_UUID] || 0) + 1; });
log(petar.every(p => String(noCumple[p.UUID] || 0) === p.Controles_No_Cumple),
  'PETAR: Controles_No_Cumple cuadra con el detalle');
log(petar.filter(p => p.Fecha === new Date().toISOString().slice(0, 10) && p.Estado === 'En ejecución').length >= 5,
  'PETAR: hay permisos vigentes HOY (para que el indicador no salga en cero)');

const iperc = filas(ESQ.modulos['07_IPERC'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
const peligros = filas(ESQ.modulos['07_IPERC'].hojaHija).filter(x => (x.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0);
const pesos = { 'Trivial': 0, 'Tolerable': 1, 'Moderado': 2, 'Importante': 3, 'Intolerable': 4 };
const peorDe = {};
peligros.forEach(p => {
  const clave = String(p.Nivel_Riesgo || '').split('·').pop().trim();
  if (pesos[clave] != null && (peorDe[p.PARENT_UUID] == null || pesos[clave] > pesos[peorDe[p.PARENT_UUID]])) {
    peorDe[p.PARENT_UUID] = clave;
  }
});
log(iperc.every(m => peorDe[m.UUID] === m.Riesgo_Maximo),
  'IPERC: Riesgo_Maximo es el peor de sus peligros');
log(peligros.every(p => {
  const n = parseInt(p.Probabilidad, 10) * parseInt(p.Severidad, 10);
  return String(p.Nivel_Riesgo || '').indexOf(String(n) + ' ·') === 0;
}), 'IPERC: cada peligro usa probabilidad × severidad de la matriz 5×5');

const epp = filas(ESQ.modulos['09_EPP'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
const items = filas(ESQ.modulos['09_EPP'].hojaHija).filter(x => (x.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0);
const nItems = {};
items.forEach(x => { nItems[x.PARENT_UUID] = (nItems[x.PARENT_UUID] || 0) + 1; });
log(epp.every(e => String(nItems[e.UUID] || 0) === e.Total_Items), 'EPP: Total_Items cuadra con el detalle');
const minRep = {};
items.forEach(x => { if (!minRep[x.PARENT_UUID] || x.Fecha_Reposicion < minRep[x.PARENT_UUID]) minRep[x.PARENT_UUID] = x.Fecha_Reposicion; });
log(epp.every(e => e.Proxima_Reposicion === minRep[e.UUID]), 'EPP: la próxima reposición es la más cercana de sus equipos');

const charlas = filas(ESQ.modulos['10_Charlas'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
const asis = filas(ESQ.modulos['10_Charlas'].hojaHija).filter(x => (x.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0);
const nAsis = {};
asis.forEach(x => { nAsis[x.PARENT_UUID] = (nAsis[x.PARENT_UUID] || 0) + 1; });
log(charlas.every(c => String(nAsis[c.UUID] || 0) === c.Total_Asistentes), 'Charlas: Total_Asistentes cuadra con la lista');
const hoy = new Date().toISOString().slice(0, 10);
const areasHoy = new Set(charlas.filter(c => c.Fecha === hoy && c.Estado === 'Ejecutada').map(c => c.Area));
log(areasHoy.size >= 5, 'Charlas: hay charlas de HOY en ' + areasHoy.size + ' áreas (el tablero de cobertura se llena)');

const cap = filas(ESQ.modulos['06_Capacitaciones'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
const vencidas = cap.filter(c => c.Fecha_Vencimiento && c.Fecha_Vencimiento < hoy).length;
const vigentes = cap.filter(c => c.Fecha_Vencimiento && c.Fecha_Vencimiento >= hoy).length;
log(vencidas > 0 && vigentes > 0,
  'Capacitaciones: hay vencidas (' + vencidas + ') y vigentes (' + vigentes + ')');

const insp = filas(ESQ.modulos['03_Inspecciones'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
log(insp.some(x => x.Estado_Actual !== 'Cerrado' && x.Plazo < hoy) && insp.some(x => x.Estado_Actual === 'Cerrado'),
  'Inspecciones: hay abiertas con plazo vencido y también cerradas');

const inc = filas(ESQ.modulos['05_Incidentes'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0);
log(inc.some(x => /tiempo perdido/i.test(x.Tipo_Evento)) && inc.filter(x => x.Tipo_Evento === 'Cuasi accidente').length > inc.length / 4,
  'Incidentes: la pirámide es realista (muchos cuasi accidentes, algún accidente con tiempo perdido)');

// Todas las fechas dentro de la ventana sembrada
const limiteDe = meses => { const d = new Date(); d.setDate(d.getDate() - meses * 30 - 2); return d.toISOString().slice(0, 10); };
const limite = limiteDe(DEMO.MESES_ATRAS);
const limiteCap = limiteDe(DEMO.MESES_ATRAS_CAPACITACION);
let fechasMal = 0;
MODULOS.forEach(id => {
  filas(ESQ.modulos[id].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0).forEach(f => {
    Object.keys(f).forEach(k => {
      if (!/^Fecha/.test(k) || !/^\d{4}-\d{2}-\d{2}$/.test(f[k])) return;
      if (/Vencimiento|Reposicion|Revision|Limite|Plazo/.test(k)) return;   // estas sí miran al futuro
      const tope = (id === '06_Capacitaciones') ? limiteCap : limite;
      if (f[k] < tope || f[k] > hoy) fechasMal++;
    });
  });
});
log(fechasMal === 0, 'Ninguna fecha de registro cae en el futuro ni fuera de su ventana');

// Ninguna celda arrastra un valor que Sheets interpretaría como fórmula
let formulas = 0;
MODULOS.forEach(id => {
  filas(ESQ.modulos[id].hoja).forEach(f => Object.keys(f).forEach(k => { if (/^=/.test(f[k])) formulas++; }));
});
log(formulas === 0, 'Ninguna celda empieza por "=" (nada se interpreta como fórmula)');

// =========================================================================
seccion('No se puede sembrar dos veces');
const segunda = G._SembrarDatosDemo();
log(segunda.ok === false && /_BorrarDatosDemo/.test(segunda.mensaje), 'Avisa en vez de duplicar');
log(filas(ESQ.modulos['10_Charlas'].hoja).filter(x => x.UUID.indexOf(DEMO.MARCA) === 0).length === DEMO.FILAS_POR_MODULO,
  'Y no añadió nada en el intento');

// =========================================================================
seccion('Borrado: se va solo lo sembrado');
// Un registro REAL, para comprobar que el borrado no lo toca
const real = api({
  action: 'SYNC_OFFLINE_QUEUE', moduleName: '10_Charlas', userToken: tokAdmin,
  items: [{ id: 1, payload: { UUID: 'real-0001-4000-8000-000000000001', Tema: 'Charla real', Fecha: hoy, Area: 'Operaciones', Estado: 'Ejecutada' } }]
});
log(real.status === 'OK', 'Se crea un registro real desde la app, junto a los de demostración');

const resumen = G._ResumenDatosDemo();
log(resumen.total > 0, '_ResumenDatosDemo cuenta ' + resumen.total + ' filas de demostración');

const borrado = G._BorrarDatosDemo();
log(borrado.ok === true && borrado.borradas === resumen.total,
  'Se borran las ' + borrado.borradas + ' filas de demostración');

log(filas(ESQ.usuarios.hoja).length === 1, 'Queda solo el administrador original');
let restos = 0, realesVivos = 0;
MODULOS.forEach(id => {
  const m = ESQ.modulos[id];
  filas(m.hoja).forEach(f => { if (f.UUID.indexOf(DEMO.MARCA) === 0) restos++; else if (f.UUID) realesVivos++; });
  if (m.hojaHija) filas(m.hojaHija).forEach(f => { if ((f.PARENT_UUID || '').indexOf(DEMO.MARCA) === 0) restos++; });
});
log(restos === 0, 'No queda ni una fila de demostración (padres ni detalle)');
log(realesVivos === 1, 'El registro real sigue intacto');
log(G._SembrarDatosDemo().ok === true, 'Tras borrar se puede volver a sembrar');

console.log(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
