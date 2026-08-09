/**
 * gen_supabase.js
 * =========================================================================
 * Genera el esquema completo de Supabase para MOTOR PWA como SaaS
 * multi-empresa, leyendo los subconfigs del proyecto.
 *
 *   node tools/gen_supabase.js
 *
 * SALIDA
 *   tools/supabase_01_schema.sql    tablas, índices y columnas de tenant
 *   tools/supabase_02_rls.sql       seguridad por fila según rol
 *   tools/supabase_03_storage.sql   buckets de archivos y sus políticas
 *   tools/supabase_04_seed.sql      empresa demo y usuarios de prueba
 *
 * MODELO DE SEGURIDAD
 * Cada tabla lleva `empresa_id`. Nadie ve datos de otra empresa: eso lo
 * garantiza Postgres, no el navegador. Dentro de la empresa, el rol decide
 * el alcance:
 *
 *   superadmin  todas las empresas (es el proveedor del servicio)
 *   admin       toda su empresa
 *   supervisor  lo que creó + donde figura como responsable
 *   trabajador  solo lo suyo
 *
 * El rol y la empresa viajan como claims del JWT de Supabase Auth, así que
 * la política no necesita consultar la tabla de usuarios en cada fila.
 * =========================================================================
 */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── Utilidades ────────────────────────────────────────────────────────────
const snake = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')     // quita tildes
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

/** Nombre de tabla desde el módulo: '03_Inspecciones' → 'inspecciones' */
const tabla = mod => snake(String(mod).replace(/^\d+_/, ''));

/** Tipo SQL a partir del tipo MOTOR y el nombre del campo */
function tipoSql(campo, tipo) {
  const n = String(campo).toLowerCase();
  const t = String(tipo || 'text').toLowerCase();
  if (t === 'hidden_uuid' || n === 'uuid')                 return 'TEXT PRIMARY KEY';
  if (t === 'date' || n.startsWith('fecha'))               return 'DATE';
  if (t === 'number')                                      return 'NUMERIC';
  if (t === 'boolean')                                     return 'BOOLEAN DEFAULT FALSE';
  // Imágenes, firmas y archivos guardan la RUTA dentro del bucket de Storage
  if (['image', 'image_collection', 'signature', 'file'].indexOf(t) !== -1) return 'TEXT';
  return 'TEXT';
}

// ── Lectura de subconfigs ─────────────────────────────────────────────────
const omitidos = [];
const avisos   = [];

function leerSubconfigs() {
  const mods = [];
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
    // 01_Usuarios NO genera tabla propia: la tabla de plataforma `usuarios`
    // ya cumple ese papel y además enlaza con Supabase Auth. Generar otra
    // provocaba un CREATE TABLE duplicado.
    if (/usuarios/i.test(nombre)) { omitidos.push(nombre + ' (usa la tabla de plataforma `usuarios`)'); return; }

    // Variables del módulo
    const bloqueVars = src.match(/Variables:\s*\{([\s\S]*?)\n\s{2}\}/);
    const campos = [];
    if (bloqueVars) {
      const re = /"([\w]+)"\s*:\s*\{[^}]*?type:\s*["'](\w+)["']/g;
      let m;
      while ((m = re.exec(bloqueVars[1]))) campos.push({ nombre: m[1], tipo: m[2] });
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

    // Campos de archivo: cada uno necesita su ruta en Storage
    const archivos = campos.filter(c =>
      ['image', 'image_collection', 'signature', 'file'].indexOf(c.tipo.toLowerCase()) !== -1);

    if (child && /^child$/i.test(child) && hijos.length) {
      avisos.push(nombre + ': CHILD_TABLE se llama "CHILD" (heredado). La tabla saldrá como ' +
                  tabla(nombre) + '_child; conviene renombrarla en el subconfig.');
    }

    mods.push({ modulo: nombre, tabla: tabla(nombre), campos, child, hijos, archivos });
  });
  return mods;
}

// ── 01 · Esquema ──────────────────────────────────────────────────────────
function sqlEsquema(mods) {
  const L = [];
  L.push('-- =========================================================================');
  L.push('-- MOTOR PWA · Esquema multi-empresa');
  L.push('-- Generado por tools/gen_supabase.js — no editar a mano');
  L.push('-- =========================================================================');
  L.push('');
  L.push('create extension if not exists "pgcrypto";');
  L.push('');
  L.push('-- ── Empresas (cada cliente del SaaS es una fila) ──────────────────────');
  L.push(`create table if not exists empresas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  ruc            text,
  plan           text not null default 'trial',      -- trial | basico | pro
  modulos        jsonb not null default '{}'::jsonb, -- { "07_IPERC": true, ... }
  activa         boolean not null default true,
  trial_hasta    date,
  creada_en      timestamptz not null default now()
);`);
  L.push('');
  L.push('-- ── Usuarios (enlazados a Supabase Auth) ──────────────────────────────');
  L.push(`create table if not exists usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  empresa_id     uuid references empresas(id) on delete cascade,
  dni            text not null,
  nombre         text not null,
  email          text,
  rol            text not null default 'trabajador'
                 check (rol in ('superadmin','admin','supervisor','trabajador')),
  area           text,
  puesto         text,
  status         text not null default 'Activo',
  creado_en      timestamptz not null default now(),
  unique (empresa_id, dni)
);
create index if not exists idx_usuarios_empresa on usuarios(empresa_id);
create index if not exists idx_usuarios_dni     on usuarios(dni);`);
  L.push('');
  L.push('-- ── Plantillas PDF por módulo y empresa ───────────────────────────────');
  L.push(`create table if not exists plantillas (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  modulo         text not null,
  doc_id         text,
  actualizado    timestamptz default now(),
  autor          text,
  primary key (empresa_id, modulo)
);`);
  L.push('');

  mods.forEach(m => {
    L.push('-- ── ' + m.modulo + ' ' + '─'.repeat(Math.max(0, 62 - m.modulo.length)));
    L.push('create table if not exists ' + m.tabla + ' (');
    const cols = ['  empresa_id     uuid not null references empresas(id) on delete cascade'];
    let tieneUuid = false;
    m.campos.forEach(c => {
      const col = snake(c.nombre);
      const tipo = tipoSql(c.nombre, c.tipo);
      if (tipo.indexOf('PRIMARY KEY') !== -1) tieneUuid = true;
      cols.push('  ' + (col + ' '.repeat(Math.max(1, 15 - col.length))) + tipo.toLowerCase());
    });
    if (!tieneUuid) cols.unshift('  uuid           text primary key');
    // Trazabilidad: quién creó la fila. Es la base del alcance 'propios'.
    cols.push('  creado_por     uuid references usuarios(id)');
    cols.push('  creado_por_dni text');
    cols.push('  creado_en      timestamptz not null default now()');
    L.push(cols.join(',\n'));
    L.push(');');
    L.push('create index if not exists idx_' + m.tabla + '_empresa on ' + m.tabla + '(empresa_id);');
    L.push('create index if not exists idx_' + m.tabla + '_creador on ' + m.tabla + '(creado_por_dni);');
    L.push('');

    if (m.child && m.hijos.length) {
      const th = m.tabla + '_' + snake(m.child);
      L.push('create table if not exists ' + th + ' (');
      const ch = ['  id             bigserial primary key',
                  '  empresa_id     uuid not null references empresas(id) on delete cascade',
                  '  parent_uuid    text not null references ' + m.tabla + '(uuid) on delete cascade'];
      m.hijos.forEach(h => {
        const col = snake(h.nombre);
        ch.push('  ' + (col + ' '.repeat(Math.max(1, 15 - col.length))) + tipoSql(h.nombre, h.tipo).toLowerCase());
      });
      ch.push('  creado_en      timestamptz not null default now()');
      L.push(ch.join(',\n'));
      L.push(');');
      L.push('create index if not exists idx_' + th + '_padre on ' + th + '(parent_uuid);');
      L.push('');
    }
  });

  return L.join('\n');
}

// ── 02 · Seguridad por fila ───────────────────────────────────────────────
function sqlRls(mods) {
  const L = [];
  L.push('-- =========================================================================');
  L.push('-- MOTOR PWA · Seguridad por fila (RLS)');
  L.push('--');
  L.push('-- Sin estas políticas, cualquier usuario con la clave anon puede leer');
  L.push('-- TODA la base. Con ellas, Postgres impide el acceso cruzado entre');
  L.push('-- empresas aunque el frontend tuviera un fallo.');
  L.push('-- =========================================================================');
  L.push('');
  L.push('-- Rol y empresa se leen de los claims del JWT: no hay consulta extra por fila.');
  L.push(`create or replace function auth_rol() returns text as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rol', ''),
    'trabajador');
$$ language sql stable;

create or replace function auth_empresa() returns uuid as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'empresa_id', ''
  )::uuid;
$$ language sql stable;

create or replace function auth_dni() returns text as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'dni', '');
$$ language sql stable;`);
  L.push('');
  L.push('-- ── empresas ──────────────────────────────────────────────────────────');
  L.push(`alter table empresas enable row level security;
drop policy if exists empresas_sel on empresas;
create policy empresas_sel on empresas for select using (
  auth_rol() = 'superadmin' or id = auth_empresa()
);
drop policy if exists empresas_mod on empresas;
create policy empresas_mod on empresas for all using (auth_rol() = 'superadmin')
                                        with check (auth_rol() = 'superadmin');`);
  L.push('');
  L.push('-- ── usuarios ──────────────────────────────────────────────────────────');
  L.push('-- El admin gestiona el personal de SU empresa; el resto solo se ve a sí mismo.');
  L.push(`alter table usuarios enable row level security;
drop policy if exists usuarios_sel on usuarios;
create policy usuarios_sel on usuarios for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and auth_rol() in ('admin','supervisor'))
   or id = auth.uid()
);
drop policy if exists usuarios_ins on usuarios;
create policy usuarios_ins on usuarios for insert with check (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);
drop policy if exists usuarios_upd on usuarios;
create policy usuarios_upd on usuarios for update using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);
drop policy if exists usuarios_del on usuarios;
create policy usuarios_del on usuarios for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);`);
  L.push('');
  L.push('-- ── plantillas ────────────────────────────────────────────────────────');
  L.push(`alter table plantillas enable row level security;
drop policy if exists plantillas_sel on plantillas;
create policy plantillas_sel on plantillas for select using (
  auth_rol() = 'superadmin' or empresa_id = auth_empresa()
);
drop policy if exists plantillas_mod on plantillas;
create policy plantillas_mod on plantillas for all using (
  auth_rol() in ('superadmin','admin') and (auth_rol() = 'superadmin' or empresa_id = auth_empresa())
) with check (
  auth_rol() in ('superadmin','admin') and (auth_rol() = 'superadmin' or empresa_id = auth_empresa())
);`);
  L.push('');

  // Campos que hacen "responsable" a alguien, por tabla
  const CAMPOS_RESP = ['responsable_dni','supervisor_dni','aprobado_por','moderado_por',
                       'revisado_por','elaborado_por','ejecutante_dni','expositor_dni',
                       'auditor_dni','entregado_por','trabajador_dni','reportado_por'];

  mods.forEach(m => {
    const cols = m.campos.map(c => snake(c.nombre));
    const resp = CAMPOS_RESP.filter(c => cols.indexOf(c) !== -1);
    // El supervisor ve lo suyo y aquello donde figura como responsable
    const condResp = resp.length
      ? ' or (' + resp.map(c => c + ' = auth_dni()').join(' or ') + ')'
      : '';

    L.push('-- ── ' + m.tabla + ' ' + '─'.repeat(Math.max(0, 60 - m.tabla.length)));
    L.push('alter table ' + m.tabla + ' enable row level security;');
    L.push(`drop policy if exists ${m.tabla}_sel on ${m.tabla};
create policy ${m.tabla}_sel on ${m.tabla} for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()${condResp ? '\n       ' + condResp.trim() : ''}
      ))
);`);
    L.push(`drop policy if exists ${m.tabla}_ins on ${m.tabla};
create policy ${m.tabla}_ins on ${m.tabla} for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);`);
    L.push(`drop policy if exists ${m.tabla}_upd on ${m.tabla};
create policy ${m.tabla}_upd on ${m.tabla} for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni()${condResp}))
      ))
);`);
    L.push(`drop policy if exists ${m.tabla}_del on ${m.tabla};
create policy ${m.tabla}_del on ${m.tabla} for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);`);
    L.push('');

    if (m.child && m.hijos.length) {
      const th = m.tabla + '_' + snake(m.child);
      L.push('-- La tabla hija hereda el acceso del padre: si no puedes ver el');
      L.push('-- registro principal, tampoco su detalle.');
      L.push(`alter table ${th} enable row level security;
drop policy if exists ${th}_all on ${th};
create policy ${th}_all on ${th} for all using (
  exists (select 1 from ${m.tabla} p where p.uuid = ${th}.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);`);
      L.push('');
    }
  });

  return L.join('\n');
}

// ── 03 · Storage ──────────────────────────────────────────────────────────
function sqlStorage(mods) {
  const L = [];
  L.push('-- =========================================================================');
  L.push('-- MOTOR PWA · Almacenamiento de archivos');
  L.push('--');
  L.push('-- Sustituye a Google Drive. Tres buckets según cómo se sirve el archivo:');
  L.push('--');
  L.push('--   evidencias  privado · fotos, firmas y adjuntos de los registros');
  L.push('--   documentos  privado · PDF generados y archivos de gestión');
  L.push('--   publico     público · logos y recursos de marca de cada empresa');
  L.push('--');
  L.push('-- CONVENCIÓN DE RUTAS  <empresa_id>/<modulo>/<uuid>/<campo>_<n>.<ext>');
  L.push('-- La empresa va PRIMERO en la ruta: así la política puede aislar por');
  L.push('-- carpeta sin consultar ninguna tabla.');
  L.push('-- =========================================================================');
  L.push('');
  L.push(`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('documentos', 'documentos', false, 26214400,
   array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/msword','application/vnd.ms-excel','text/csv','image/jpeg','image/png']),
  ('publico',    'publico',    true,   2097152,
   array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;`);
  L.push('');
  L.push('-- El primer segmento de la ruta es la empresa: (storage.foldername(name))[1]');
  L.push(`create or replace function storage_empresa(ruta text) returns uuid as $$
  select nullif((storage.foldername(ruta))[1], '')::uuid;
$$ language sql stable;`);
  L.push('');

  ['evidencias', 'documentos'].forEach(b => {
    L.push('-- ── bucket ' + b + ' (privado) ──');
    L.push(`drop policy if exists ${b}_sel on storage.objects;
create policy ${b}_sel on storage.objects for select using (
  bucket_id = '${b}' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists ${b}_ins on storage.objects;
create policy ${b}_ins on storage.objects for insert with check (
  bucket_id = '${b}' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists ${b}_upd on storage.objects;
create policy ${b}_upd on storage.objects for update using (
  bucket_id = '${b}' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Borrar evidencia es destruir prueba: reservado a admin y proveedor.
drop policy if exists ${b}_del on storage.objects;
create policy ${b}_del on storage.objects for delete using (
  bucket_id = '${b}' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);`);
    L.push('');
  });

  L.push('-- ── bucket publico (lectura abierta, escritura del admin) ──');
  L.push(`drop policy if exists publico_sel on storage.objects;
create policy publico_sel on storage.objects for select using (bucket_id = 'publico');
drop policy if exists publico_mod on storage.objects;
create policy publico_mod on storage.objects for all using (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
                        and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
) with check (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
);`);
  L.push('');
  L.push('-- Campos de archivo detectados en los subconfigs:');
  mods.forEach(m => {
    if (!m.archivos.length) return;
    L.push('--   ' + m.modulo + ': ' + m.archivos.map(a => a.nombre + ' (' + a.tipo + ')').join(', '));
  });

  return L.join('\n');
}

// ── 04 · Semilla ──────────────────────────────────────────────────────────
function sqlSeed(mods) {
  const modulos = {};
  mods.forEach(m => { modulos[m.modulo] = true; });
  return `-- =========================================================================
-- MOTOR PWA · Datos de arranque
-- Crea una empresa de demostración con todos los módulos activos.
--
-- Los usuarios se crean desde Supabase Auth (panel o API) y DESPUÉS se
-- enlazan aquí. El rol y la empresa deben copiarse a app_metadata del
-- usuario de Auth, porque las políticas RLS los leen del JWT:
--
--   update auth.users set raw_app_meta_data = raw_app_meta_data ||
--     '{"rol":"admin","empresa_id":"<uuid>","dni":"12345678"}'::jsonb
--   where email = 'admin@empresa-demo.com';
-- =========================================================================

insert into empresas (id, nombre, ruc, plan, modulos, trial_hasta)
values (
  '00000000-0000-0000-0000-000000000001',
  'Empresa Demostración S.A.C.',
  '20000000001',
  'trial',
  '${JSON.stringify(modulos)}'::jsonb,
  current_date + interval '30 days'
)
on conflict (id) do nothing;
`;
}

// ── Ejecución ─────────────────────────────────────────────────────────────
const mods = leerSubconfigs();
if (!mods.length) {
  console.error('No se halló ningún subconfig. ¿Ejecutaste desde la raíz del proyecto?');
  process.exit(1);
}

const salidas = [
  ['supabase_01_schema.sql',  sqlEsquema(mods)],
  ['supabase_02_rls.sql',     sqlRls(mods)],
  ['supabase_03_storage.sql', sqlStorage(mods)],
  ['supabase_04_seed.sql',    sqlSeed(mods)]
];
salidas.forEach(([f, c]) => fs.writeFileSync(path.join(__dirname, f), c, 'utf8'));

console.log('Esquema Supabase generado desde ' + mods.length + ' módulos:\n');
mods.forEach(m => {
  const hija = m.child ? '  + ' + m.tabla + '_' + snake(m.child) : '';
  console.log('  ' + m.tabla.padEnd(20) + m.campos.length + ' campos' +
              (m.archivos.length ? ', ' + m.archivos.length + ' de archivo' : '') + hija);
});
console.log('\nArchivos:');
salidas.forEach(([f]) => console.log('  tools/' + f));
console.log('\nEjecutar en el editor SQL de Supabase EN ESTE ORDEN: 01, 02, 03, 04.');
