/**
 * tools/subconfigs.js — lectura de los subconfigs (fuente única del esquema)
 * =========================================================================
 * Lo usan los dos generadores de backend:
 *   tools/gen_supabase.js   → SQL de Supabase (tablas, RLS, Storage)
 *   tools/gen_appscript.js  → bloque ESQUEMA de 00_Config/Code.gs
 * Así un módulo nuevo (o un campo nuevo) llega igual a las dos bases.
 * =========================================================================
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const snake = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')     // quita tildes
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

/** Nombre de tabla desde el módulo: '03_Inspecciones' → 'inspecciones' */
const tabla = mod => snake(String(mod).replace(/^\d+_/, ''));

// Campos que hacen "responsable" a alguien (alcance 'responsable')
/**
 * Cuerpo `{ ... }` de un campo dentro del bloque Variables, con las llaves
 * balanceadas. Hace falta porque un campo REF lleva un objeto anidado
 * (`slice: { ... }`) y un `[^}]*` se cortaria en la primera llave de cierre.
 * @returns {string} el cuerpo sin llaves, normalizado a espacios simples
 */
function cuerpoCampo(bloque, nombre) {
  const i = bloque.search(new RegExp('"' + nombre + '"\\s*:\\s*\\{'));
  if (i === -1) return '';
  const ini = bloque.indexOf('{', i);
  let prof = 0;
  for (let j = ini; j < bloque.length; j++) {
    if (bloque[j] === '{') prof++;
    else if (bloque[j] === '}') { prof--; if (!prof) return bloque.slice(ini + 1, j).replace(/\s+/g, ' '); }
  }
  return '';
}

const CAMPOS_RESP = ['responsable_dni','supervisor_dni','aprobado_por','moderado_por',
                     'revisado_por','elaborado_por','ejecutante_dni','expositor_dni',
                     'auditor_dni','entregado_por','trabajador_dni','reportado_por'];

const ROLES = ['admin', 'supervisor', 'trabajador'];
const TIPOS_ARCHIVO = ['image', 'image_collection', 'signature', 'file', 'face_photo'];

/**
 * @param {{incluirUsuarios?: boolean}} [opts]
 * @returns {{mods: object[], avisos: string[], omitidos: string[]}}
 *   cada mod: { modulo, tabla, campos[{nombre,tipo}], child, hijos[{nombre,tipo}],
 *               archivos[{nombre,tipo}], roles{admin|supervisor|trabajador:
 *               {crear,leer,editar,eliminar,alcance}}, emailTemplateId, esUsuarios }
 */
function leerSubconfigs(opts) {
  opts = opts || {};
  const mods = [], avisos = [], omitidos = [];
  const dirs = fs.readdirSync(ROOT).filter(d => /^\d\d_/.test(d) &&
    fs.statSync(path.join(ROOT, d)).isDirectory());
  dirs.push(path.join('00_Config', '001_Configuraciones'));

  dirs.forEach(dir => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    const archivo = fs.readdirSync(abs).find(f => /^subconfig_.*\.js\.html$/.test(f));
    if (!archivo) return;

    const src = fs.readFileSync(path.join(abs, archivo), 'utf8');
    const nombre = (src.match(/NombreInterno:\s*["']([^"']+)["']/) || [])[1] ||
                   path.basename(dir);
    if (/admin|configuraciones/i.test(nombre)) return;      // no son tablas de datos
    const esUsuarios = /usuarios/i.test(nombre);
    // En Supabase 01_Usuarios NO genera tabla propia: la tabla de plataforma
    // `usuarios` ya cumple ese papel y además enlaza con Supabase Auth.
    if (esUsuarios && !opts.incluirUsuarios) {
      omitidos.push(nombre + ' (usa la tabla de plataforma `usuarios`)');
      return;
    }

    // Variables del módulo
    const bloqueVars = src.match(/Variables:\s*\{([\s\S]*?)\n\s{2}\}/);
    const campos = [];
    if (bloqueVars) {
      const re = /"([\w]+)"\s*:\s*\{[^}]*?type:\s*["'](\w+)["']/g;
      let m;
      while ((m = re.exec(bloqueVars[1]))) campos.push({ nombre: m[1], tipo: m[2] });
      // isFilter marca los campos con su propio control en el panel de filtros.
      // Son los que se consultan una y otra vez, asi que son los que merecen
      // indice en Postgres (tools/gen_supabase.js, 08_rendimiento).
      campos.forEach(c => { c.filtro = cuerpoCampo(bloqueVars[1], c.nombre).indexOf('isFilter: true') !== -1; });
    }

    // Tabla hija y sus campos
    const child = (src.match(/CHILD_TABLE:\s*["']([^"']*)["']/) || [])[1] || '';
    const hijos = [];
    const bloqueRel = src.match(/Relational_Fields:\s*\[([\s\S]*?)\n\s{4}\]/);
    if (bloqueRel) {
      const re = /name:\s*["'](\w+)["'][^}]*?type:\s*["'](\w+)["']/g;
      let m;
      while ((m = re.exec(bloqueRel[1]))) hijos.push({ nombre: m[1], tipo: m[2] });
    }

    // Campos de archivo: cada uno necesita su ruta en Storage / Drive
    const archivos = campos.filter(c => TIPOS_ARCHIVO.indexOf(c.tipo.toLowerCase()) !== -1);

    if (child && /^child$/i.test(child) && hijos.length) {
      avisos.push(nombre + ': CHILD_TABLE se llama "CHILD" (heredado). La tabla saldrá como ' +
                  tabla(nombre) + '_child; conviene renombrarla en el subconfig.');
    }

    // Matriz de permisos por rol (AdminRole / SupervisorRole / TrabajadorRole).
    // Es la misma fuente que usa PERMISOS en el navegador: el backend la hace
    // cumplir también contra quien llame a la API directamente.
    const roles = {};
    const reRol = /(Admin|Supervisor|Trabajador|Worker)Role:\s*\{([^}]*)\}/g;
    let mr;
    while ((mr = reRol.exec(src))) {
      const clave = { Admin: 'admin', Supervisor: 'supervisor', Trabajador: 'trabajador', Worker: 'trabajador' }[mr[1]];
      const bool = k => new RegExp(k + ':\\s*true').test(mr[2]);
      roles[clave] = {
        crear: bool('canCreate'), leer: bool('canRead'), editar: bool('canUpdate'), eliminar: bool('canDelete'),
        alcance: (mr[2].match(/alcance:\s*["'](\w+)["']/) || [])[1] ||
                 ({ admin: 'todos', supervisor: 'responsable', trabajador: 'propios' })[clave]
      };
    }
    ROLES.forEach(r => {
      if (!roles[r]) {
        avisos.push(nombre + ': sin matriz para el rol ' + r + ' — se asume sin permisos.');
        roles[r] = { crear: false, leer: false, editar: false, eliminar: false,
                     alcance: ({ admin: 'todos', supervisor: 'responsable', trabajador: 'propios' })[r] };
      }
    });

    const emailTemplateId = (src.match(/EMAIL_TEMPLATE_ID:\s*["']([^"']*)["']/) || [])[1] || '';

    mods.push({ modulo: nombre, tabla: tabla(nombre), campos, child, hijos, archivos, roles,
                emailTemplateId, esUsuarios });
  });
  return { mods, avisos, omitidos };
}

module.exports = { ROOT, snake, tabla, CAMPOS_RESP, ROLES, TIPOS_ARCHIVO, leerSubconfigs };
