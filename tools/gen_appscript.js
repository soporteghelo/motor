/**
 * gen_appscript.js — esquema del backend Apps Script
 * =========================================================================
 *   node tools/gen_appscript.js        (o: npm run appscript)
 *
 * Lee los subconfigs (misma fuente que tools/gen_supabase.js) y reescribe el
 * bloque ESQUEMA de 00_Config/Code.gs, entre las marcas
 *   // <<<ESQUEMA-INICIO>>>   y   // <<<ESQUEMA-FIN>>>
 * El resultado sigue siendo UN solo archivo, listo para pegar en Apps Script.
 *
 * Por módulo: pestaña, columnas (campos del subconfig + Creado_Por_DNI,
 * Creado_En, Actualizado_En), pestaña de detalle, campos de archivo,
 * campos de "responsable" y la matriz de permisos por rol.
 * =========================================================================
 */
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const crypto = require('crypto');
const { ROOT, snake, CAMPOS_RESP, leerSubconfigs } = require('./subconfigs');

const CODE_GS = path.join(ROOT, '00_Config', 'Code.gs');
const SISTEMA_MODULO   = ['Creado_Por_DNI', 'Creado_En', 'Actualizado_En'];

// Columna que guarda la empresa DUEÑA del registro. La sella el servidor con
// la empresa de quien lo crea (Code.gs → guardarRegistro_) y es lo que
// delimita qué ve cada Admin o Supervisor; el cliente no puede enviarla.
//
// Se llama 'Empresa', salvo cuando el módulo ya tiene un campo propio con ese
// nombre — 08_PETAR lo tiene: la contratista que EJECUTA el trabajo, que sí
// escribe el usuario. Ahí se usa 'Empresa_Registro', porque si compartieran
// columna el servidor pisaría un dato del formulario.
const columnaEmpresa = nombres =>
  nombres.indexOf('Empresa') === -1 ? 'Empresa' : 'Empresa_Registro';
const SISTEMA_USUARIOS = ['Area', 'Puesto', 'Creado_En', 'Actualizado_En', 'Ultimo_Acceso'];

const unir = (a, b) => a.concat(b.filter(x => a.indexOf(x) === -1));

const { mods, avisos } = leerSubconfigs({ incluirUsuarios: true });
if (!mods.length) { console.error('No se halló ningún subconfig.'); process.exit(1); }

const tiposArchivo = m => {
  const t = {};
  m.archivos.forEach(a => { t[a.nombre] = a.tipo; });
  return t;
};

/**
 * Clase de comparacion de cada campo, para que QUERY_DB/COUNT_DB filtren con
 * el tipo correcto: una fecha se compara como fecha y un numero como numero,
 * no como texto ('9' > '10' seria cierto comparando cadenas). Misma regla que
 * tipoSql() en gen_supabase.js, para que el filtro de Sheets y el de Postgres
 * no den resultados distintos.
 * Solo se emiten los campos que NO son texto: ausente = texto.
 */
const clasesCampo = m => {
  const c = {};
  m.campos.forEach(campo => {
    const n = String(campo.nombre).toLowerCase();
    const t = String(campo.tipo || '').toLowerCase();
    if (t === 'date' || n.indexOf('fecha') === 0) c[campo.nombre] = 'date';
    else if (t === 'number')  c[campo.nombre] = 'numeric';
    else if (t === 'boolean') c[campo.nombre] = 'boolean';
    else if (t === 'enum')    c[campo.nombre] = 'enum';
    else if (['image', 'image_collection', 'signature', 'file', 'face_photo', 'password'].indexOf(t) !== -1) {
      c[campo.nombre] = 'opaco';   // nunca se busca dentro de una foto ni de un hash
    }
  });
  return c;
};

const esquema = { version: '', usuarios: null, modulos: {} };

mods.sort((a, b) => a.modulo.localeCompare(b.modulo)).forEach(m => {
  const nombres = m.campos.map(c => c.nombre);
  if (m.esUsuarios) {
    esquema.usuarios = {
      id: m.modulo, hoja: m.modulo,
      campos: unir(unir(['UUID', 'DNI'], nombres), unir(['Password_Hash'], SISTEMA_USUARIOS)),
      archivos: m.archivos.map(a => a.nombre),
      tipos: tiposArchivo(m),
      clases: clasesCampo(m)
    };
    return;
  }
  const responsables = nombres.filter(n => CAMPOS_RESP.indexOf(snake(n)) !== -1);
  const colEmpresa = columnaEmpresa(nombres);
  esquema.modulos[m.modulo] = {
    hoja: m.modulo,
    hojaHija: (m.child && m.hijos.length) ? m.modulo + '__' + m.child : '',
    campos: unir(unir(['UUID'], nombres), [colEmpresa].concat(SISTEMA_MODULO)),
    columnaEmpresa: colEmpresa,
    camposHijo: m.hijos.map(h => h.nombre).filter(n => n !== 'PARENT_UUID'),
    archivos: m.archivos.map(a => a.nombre),
    tipos: tiposArchivo(m),
    clases: clasesCampo(m),
    responsables,
    roles: m.roles,
    emailTemplateId: m.emailTemplateId || '',
    // Segregación de funciones: quien solicita un PETAR no lo aprueba
    validarAprobacion: m.tabla === 'petar' && nombres.indexOf('Aprobado_Por') !== -1 && nombres.indexOf('Estado') !== -1
  };
});

if (!esquema.usuarios) { console.error('Falta el subconfig de 01_Usuarios.'); process.exit(1); }
esquema.version = crypto.createHash('sha1').update(JSON.stringify(esquema)).digest('hex').slice(0, 10);

// ── Inyección en Code.gs ───────────────────────────────────────────────────
let code = fs.readFileSync(CODE_GS, 'utf8');
// Las marcas pueden estar indentadas (ESQUEMA vive dentro de un bloque): se
// capturan con su sangría y se devuelven tal cual, sin tocar el resto.
const re = /([ \t]*\/\/ <<<ESQUEMA-INICIO>>>\r?\n)[\s\S]*?(\r?\n[ \t]*\/\/ <<<ESQUEMA-FIN>>>)/;
if (!re.test(code)) { console.error('No se hallaron las marcas <<<ESQUEMA-INICIO>>> / <<<ESQUEMA-FIN>>> en Code.gs'); process.exit(1); }
// Formato legible y compacto: objetos con sangría, listas y objetos pequeños en una línea
function fmt(v, ind) {
  const pad = '  '.repeat(ind);
  if (Array.isArray(v) || v === null || typeof v !== 'object') return JSON.stringify(v);
  const plano = JSON.stringify(v);
  if (plano.length <= 110) return plano;
  const claves = Object.keys(v);
  return '{\n' + claves.map((k, i) => pad + '  ' + JSON.stringify(k) + ': ' + fmt(v[k], ind + 1) +
    (i < claves.length - 1 ? ',' : '')).join('\n') + '\n' + pad + '}';
}
const bloque = 'const ESQUEMA = ' + fmt(esquema, 0) + ';';
code = code.replace(re, (m, a, b) => a + bloque + b);

// Debe seguir siendo JavaScript válido (Apps Script V8)
try { new vm.Script(code, { filename: 'Code.gs' }); }
catch (e) { console.error('❌ Code.gs no compila tras inyectar el esquema: ' + e.message); process.exit(1); }
fs.writeFileSync(CODE_GS, code, 'utf8');

// ── Resumen ────────────────────────────────────────────────────────────────
console.log('Esquema Apps Script ' + esquema.version + ' → 00_Config/Code.gs\n');
console.log('  ' + esquema.usuarios.hoja.padEnd(24) + esquema.usuarios.campos.length + ' columnas');
Object.keys(esquema.modulos).forEach(id => {
  const m = esquema.modulos[id];
  console.log('  ' + m.hoja.padEnd(24) + m.campos.length + ' columnas' +
              (m.archivos.length ? ', ' + m.archivos.length + ' de archivo' : '') +
              (m.hojaHija ? '  + ' + m.hojaHija : ''));
});
avisos.forEach(a => console.log('⚠️  ' + a));
console.log('\nPega 00_Config/Code.gs completo en Apps Script y ejecuta _CrearProyecto (añade lo que falte).');
