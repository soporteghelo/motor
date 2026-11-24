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
// Parser de subconfigs compartido con tools/gen_appscript.js
const { snake, CAMPOS_RESP, ROLES, leerSubconfigs: leerTodos } = require('./subconfigs');

/** Tipo SQL a partir del tipo MOTOR y el nombre del campo */
function tipoSql(campo, tipo) {
  const n = String(campo).toLowerCase();
  const t = String(tipo || 'text').toLowerCase();
  if (t === 'hidden_uuid' || n === 'uuid')                 return 'TEXT PRIMARY KEY';
  if (t === 'date' || n.startsWith('fecha'))               return 'DATE';
  if (t === 'number')                                      return 'NUMERIC';
  if (t === 'boolean')                                     return 'BOOLEAN DEFAULT FALSE';
  // Imágenes, firmas y archivos guardan la RUTA dentro del bucket de Storage
  if (['image', 'image_collection', 'signature', 'file', 'face_photo'].indexOf(t) !== -1) return 'TEXT';
  return 'TEXT';
}


/**
 * Condición SQL (dentro de la empresa) de los roles que pueden `accion`
 * ('editar' | 'eliminar') según la matriz del subconfig y su alcance.
 * @param {string} p  prefijo de columnas ('' o 'p.' en subconsultas)
 */
function condPermiso(m, accion, p) {
  const cols = m.campos.map(c => snake(c.nombre));
  const resp = CAMPOS_RESP.filter(c => cols.indexOf(c) !== -1);
  const partes = ROLES.filter(r => m.roles[r][accion]).map(r => {
    const a = m.roles[r].alcance;
    if (a === 'todos') return `auth_rol() = '${r}'`;
    const propio = `${p}creado_por_dni = auth_dni()`;
    if (a === 'responsable' && resp.length) {
      return `(auth_rol() = '${r}' and (${propio} or ${resp.map(c => p + c + ' = auth_dni()').join(' or ')}))`;
    }
    return `(auth_rol() = '${r}' and ${propio})`;
  });
  return partes.length ? partes.join(' or ') : 'false';
}

// ── Lectura de subconfigs (tools/subconfigs.js) ───────────────────────────
let omitidos = [];
let avisos   = [];
function leerSubconfigs() {
  const r = leerTodos();
  omitidos = r.omitidos; avisos = r.avisos;
  return r.mods;
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
  config         jsonb not null default '{}'::jsonb, -- ajustes de la app que edita el Admin
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
  foto_perfil    text,                               -- ruta en Storage (bucket evidencias)
  firma_cargo    text,                               -- ruta en Storage (bucket evidencias)
  -- Constancia de autorizacion de firma digital que cada persona firma la
  -- primera vez que entra (00_Config/Consentimiento.js.html). Con la fecha
  -- puesta, el asistente ya no vuelve a pedirse.
  consentimiento_fecha text,
  consentimiento_folio text,
  consentimiento_path  text,                         -- documentos/<empresa>/consentimientos/<dni>.pdf
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
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
    // Lo que lee la sincronización delta: cambia en cada UPDATE (trigger en 07)
    cols.push('  actualizado_en timestamptz not null default now()');
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
      ch.push('  actualizado_en timestamptz not null default now()');
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
  L.push(`-- nullif(...,''): fuera de PostgREST (editor SQL, cron) el setting llega vacío
-- y ''::jsonb lanzaría un error en vez de devolver NULL.
create or replace function auth_claims() returns jsonb as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$ language sql stable;

create or replace function auth_rol() returns text as $$
  select coalesce(nullif(auth_claims() -> 'app_metadata' ->> 'rol', ''), 'trabajador');
$$ language sql stable;

create or replace function auth_empresa() returns uuid as $$
  select nullif(auth_claims() -> 'app_metadata' ->> 'empresa_id', '')::uuid;
$$ language sql stable;

create or replace function auth_dni() returns text as $$
  select coalesce(auth_claims() -> 'app_metadata' ->> 'dni', '');
$$ language sql stable;

-- true con la service_role (scripts de servidor, /api de Vercel) o sin JWT
-- (editor SQL). Los triggers de autoría no deben pisar lo que estos escriben.
create or replace function es_servidor() returns boolean as $$
  select coalesce(auth_claims() ->> 'role', 'service_role') = 'service_role';
$$ language sql stable;

-- Bases desplegadas antes de que empresas tuviera config (lo usa la función siguiente)
alter table empresas add column if not exists config jsonb not null default '{}'::jsonb;

-- ¿Puede el usuario en sesión usar este módulo? Tres condiciones, todas en el
-- servidor (antes solo las comprobaba el navegador, y la API las ignoraba):
--   1. la empresa está activa (el SuperAdmin la suspende con activa = false);
--   2. el módulo está en su plan (empresas.modulos; un plan vacío = todo);
--   3. el Admin no lo ocultó para este rol
--      (empresas.config -> 'Modulos_Visibles' -> '<modulo>' -> '<rol>' = false).
-- Se compara texto, no ::boolean: un valor raro en config no debe romper
-- todas las consultas de la empresa. Las políticas la llaman como
-- (select modulo_habilitado('…')) para que Postgres la evalúe una vez por
-- consulta y no una vez por fila.
create or replace function modulo_habilitado(p_modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_rol() = 'superadmin' or coalesce((
    select e.activa
       and (e.modulos = '{}'::jsonb or (e.modulos ->> p_modulo) = 'true')
       and coalesce(e.config #>> array['Modulos_Visibles', p_modulo, auth_rol()], 'true') <> 'false'
      from empresas e
     where e.id = auth_empresa()
  ), false);
$$;
revoke all on function modulo_habilitado(text) from public;
grant execute on function modulo_habilitado(text) to authenticated;`);
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
-- "or id = auth.uid()": cada persona corrige SU ficha (área, puesto, foto,
-- firma, y la constancia de consentimiento que firma al entrar por primera
-- vez). No es un agujero: el trigger proteger_usuarios ya impide que nadie
-- se cambie el rol, el estado, la empresa, el DNI o el correo a sí mismo.
create policy usuarios_upd on usuarios for update using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
  or id = auth.uid()
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

  mods.forEach(m => {
    const cols = m.campos.map(c => snake(c.nombre));
    const resp = CAMPOS_RESP.filter(c => cols.indexOf(c) !== -1);
    // Lectura según la matriz (canRead + alcance), igual que Code.gs y que
    // PERMISOS en el navegador. Antes la política ignoraba canRead (un rol
    // con canRead:false seguía leyendo lo suyo) y trataba 'todos' como
    // 'responsable' para el supervisor. Quien no ve "todos" ve lo que creó y
    // aquello donde figura (responsable, trabajador afectado, reportante…).
    const habil = `(select modulo_habilitado('${m.modulo}'))`;
    const lectores = ROLES.filter(r => m.roles[r].leer);
    const verTodo  = lectores.filter(r => m.roles[r].alcance === 'todos');
    const verSuyo  = lectores.filter(r => m.roles[r].alcance !== 'todos');
    const lista = rs => rs.map(r => "'" + r + "'").join(', ');
    const selPartes = [];
    if (verTodo.length) selPartes.push(`auth_rol() in (${lista(verTodo)})`);
    if (verSuyo.length) {
      selPartes.push(`(auth_rol() in (${lista(verSuyo)}) and (\n            creado_por_dni = auth_dni()` +
        resp.map(c => `\n         or ${c} = auth_dni()`).join('') + '))');
    }
    const selCond = selPartes.length ? selPartes.join('\n       or ') : 'false';

    L.push('-- ── ' + m.tabla + ' ' + '─'.repeat(Math.max(0, 60 - m.tabla.length)));
    L.push('alter table ' + m.tabla + ' enable row level security;');
    L.push(`drop policy if exists ${m.tabla}_sel on ${m.tabla};
create policy ${m.tabla}_sel on ${m.tabla} for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and ${habil} and (
          ${selCond}
      ))
);`);
    // Escritura según la matriz del subconfig (canCreate/canUpdate/canDelete
    // + alcance). Antes cualquier rol podía insertar y el supervisor editar
    // aunque la matriz dijera lo contrario: la matriz solo ocultaba botones.
    const crean = ROLES.filter(r => m.roles[r].crear);
    const insCond = crean.length
      ? `(empresa_id = auth_empresa() and ${habil} and auth_rol() in (${crean.map(r => "'" + r + "'").join(', ')}))`
      : 'false';
    const updCond = condPermiso(m, 'editar', '');
    const delCond = condPermiso(m, 'eliminar', '');

    L.push(`drop policy if exists ${m.tabla}_ins on ${m.tabla};
create policy ${m.tabla}_ins on ${m.tabla} for insert with check (
  auth_rol() = 'superadmin' or ${insCond}
);`);
    L.push(`drop policy if exists ${m.tabla}_upd on ${m.tabla};
create policy ${m.tabla}_upd on ${m.tabla} for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and ${habil} and (${updCond}))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and ${habil} and (${updCond}))
);`);
    L.push(`drop policy if exists ${m.tabla}_del on ${m.tabla};
create policy ${m.tabla}_del on ${m.tabla} for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and ${habil} and (${delCond}))
);`);
    L.push('');

    if (m.child && m.hijos.length) {
      const th = m.tabla + '_' + snake(m.child);
      // Escribir el detalle = poder editar el padre. Excepción: quien lo creó
      // puede completar sus filas hijas durante las primeras 24 h aunque no
      // tenga permiso de edición (el Trabajador que registra una charla con
      // su lista de asistentes). Antes bastaba con VER el padre para borrar o
      // alterar su detalle, y con pertenecer a la empresa para insertar.
      const escritura = `exists (
    select 1 from ${m.tabla} p
     where p.uuid = ${th}.parent_uuid
       and p.empresa_id = ${th}.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   ${condPermiso(m, 'editar', 'p.')}
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )`;
      L.push('-- La tabla hija hereda el acceso del padre: si no puedes ver el');
      L.push('-- registro principal, tampoco su detalle; y solo escribe en él quien');
      L.push('-- puede editar el registro principal.');
      L.push(`alter table ${th} enable row level security;
drop policy if exists ${th}_all on ${th};
drop policy if exists ${th}_sel on ${th};
create policy ${th}_sel on ${th} for select using (
  exists (select 1 from ${m.tabla} p where p.uuid = ${th}.parent_uuid and p.empresa_id = ${th}.empresa_id)
);
drop policy if exists ${th}_ins on ${th};
create policy ${th}_ins on ${th} for insert with check (
  ${escritura}
);
drop policy if exists ${th}_upd on ${th};
create policy ${th}_upd on ${th} for update using (
  ${escritura}
) with check (
  ${escritura}
);
drop policy if exists ${th}_del on ${th};
create policy ${th}_del on ${th} for delete using (
  ${escritura}
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
  L.push('--   informes    privado · el informe PDF de cada registro (derivado)');
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
         'application/msword','application/vnd.ms-excel','text/csv','text/plain',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-powerpoint','image/jpeg','image/png']),
  ('informes',   'informes',   false, 10485760, array['application/pdf']),
  ('publico',    'publico',    true,   2097152,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Sin image/svg+xml en publico: un SVG puede llevar <script> y se serviría
-- desde un dominio público como contenido activo.`);
  L.push('');
  L.push('-- El primer segmento de la ruta es la empresa: (storage.foldername(name))[1].');
  L.push('-- Si no es un uuid (p. ej. "sin-empresa/…") devuelve NULL en vez de lanzar');
  L.push('-- un error de conversión que rompería el listado entero.');
  L.push(`create or replace function storage_empresa(ruta text) returns uuid as $$
  select case when (storage.foldername(ruta))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(ruta))[1])::uuid end;
$$ language sql stable;`);
  L.push('');

  // Lectura por registro: un archivo se ve si se puede ver el registro al que
  // pertenece (<empresa>/<modulo>/<uuid>/…). La consulta corre con los
  // permisos de quien pregunta, así que aplica el RLS de la tabla del módulo.
  // Antes cualquier miembro de la empresa listaba y descargaba TODAS las
  // fotos y firmas.
  const ramas = mods.map(m => `    when '${m.modulo}' then return exists (select 1 from ${m.tabla} t where t.uuid = v_id);`);
  L.push(`create or replace function storage_puede_leer(ruta text) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  if auth_rol() = 'superadmin' then return true; end if;
  if storage_empresa(ruta) is distinct from auth_empresa() then return false; end if;
  if auth_rol() = 'admin' then return true; end if;
  case v_mod
${ramas.join('\n')}
    -- Foto y firma del personal: las ve quien puede ver a esa persona
    when '01_Usuarios' then return exists (select 1 from usuarios u where u.id::text = v_id);
    else return false;
  end case;
end $$;`);
  L.push('');

  ['evidencias', 'documentos'].forEach(b => {
    L.push('-- ── bucket ' + b + ' (privado) ──');
    L.push(`drop policy if exists ${b}_sel on storage.objects;
create policy ${b}_sel on storage.objects for select using (
  bucket_id = '${b}' and storage_puede_leer(name)
);
drop policy if exists ${b}_ins on storage.objects;
create policy ${b}_ins on storage.objects for insert with check (
  bucket_id = '${b}' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Sobrescribir una evidencia equivale a destruirla: igual que borrar, solo
-- admin y proveedor. La app sube cada archivo con nombre único y sin upsert.
drop policy if exists ${b}_upd on storage.objects;
create policy ${b}_upd on storage.objects for update using (
  bucket_id = '${b}' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Borrar evidencia es destruir prueba: reservado a admin y proveedor.
drop policy if exists ${b}_del on storage.objects;
create policy ${b}_del on storage.objects for delete using (
  bucket_id = '${b}' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);`);
    L.push('');
  });

  // ── Informes: el PDF de cada registro ───────────────────────────────────
  // Ruta: <empresa>/<modulo>/<uuid>/informe.pdf — la misma convención, así que
  // storage_puede_leer() ya decide quién lo ve: quien ve el registro.
  //
  // Va en un bucket aparte de `evidencias`/`documentos` por una razón de
  // fondo: ahí sobrescribir y borrar están reservados al Admin, porque
  // hacerlo es destruir prueba. Un informe NO es prueba original: es un
  // documento DERIVADO que la app regenera del registro en cada cambio. Si
  // solo el Admin pudiera reescribirlo, el informe del supervisor que edita
  // su inspección quedaría viejo para siempre, que es peor.
  //
  // Lo reescribe entonces quien puede editar el registro, más su autor
  // (hay roles que crean y no editan: sin eso el registro recién hecho no
  // tendría informe). Nunca alguien que solo pueda leerlo.
  const ramasArch = mods.map(m => `    when '${m.modulo}' then return exists (
      select 1 from ${m.tabla} t
       where t.uuid = v_id
         and (${condPermiso(m, 'editar', 't.')} or t.creado_por_dni = auth_dni()));`);
  L.push(`create or replace function storage_puede_archivar(ruta text) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  if auth_rol() = 'superadmin' then return true; end if;
  if storage_empresa(ruta) is distinct from auth_empresa() then return false; end if;
  case v_mod
${ramasArch.join('\n')}
    else return false;
  end case;
end $$;`);
  L.push('');
  // Borrar el informe de un registro que ya no existe. Pasa en el caso normal:
  // la app borra primero el registro (si RLS lo rechaza, el informe debe
  // seguir ahí) y después su informe, que en ese momento es huérfano.
  // security definer: solo mira si la fila existe, sin filtrar por rol — si
  // aplicara el RLS de lectura, un trabajador vería "no existe" el registro
  // ajeno y podría borrar informes que no son suyos.
  const ramasHuerf = mods.map(m => `    when '${m.modulo}' then return not exists (select 1 from ${m.tabla} t where t.uuid = v_id);`);
  L.push(`create or replace function informe_huerfano(ruta text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  case v_mod
${ramasHuerf.join('\n')}
    else return false;
  end case;
end $$;
revoke all on function informe_huerfano(text) from public;
grant execute on function informe_huerfano(text) to authenticated;`);
  L.push('');
  L.push('-- ── bucket informes (privado · un PDF por registro) ──');
  L.push(`drop policy if exists informes_sel on storage.objects;
create policy informes_sel on storage.objects for select using (
  bucket_id = 'informes' and storage_puede_leer(name)
);
drop policy if exists informes_ins on storage.objects;
create policy informes_ins on storage.objects for insert with check (
  bucket_id = 'informes' and storage_puede_archivar(name)
);
-- Sobrescribir es lo normal aquí: el informe se regenera con cada cambio del
-- registro y su nombre no cambia (uno por registro, no uno por edición).
drop policy if exists informes_upd on storage.objects;
create policy informes_upd on storage.objects for update using (
  bucket_id = 'informes' and storage_puede_archivar(name)
) with check (
  bucket_id = 'informes' and storage_puede_archivar(name)
);
-- Se borra al eliminar el registro: quien podía reescribirlo o, cuando el
-- registro ya no existe (informe huérfano), quien pueda verlo dentro de su
-- empresa. En la práctica eso es el Admin, que es el único rol con canDelete
-- en los diez módulos y, por tanto, el único que llega a este caso: la app
-- borra primero el registro y después su informe.
drop policy if exists informes_del on storage.objects;
create policy informes_del on storage.objects for delete using (
  bucket_id = 'informes' and (
       storage_puede_archivar(name)
    or (storage_empresa(name) = auth_empresa() and informe_huerfano(name))
  )
);`);
  L.push('');
  L.push('-- ── bucket publico (lectura abierta, escritura del admin) ──');
  L.push(`drop policy if exists publico_sel on storage.objects;
create policy publico_sel on storage.objects for select using (bucket_id = 'publico');
drop policy if exists publico_mod on storage.objects;
create policy publico_mod on storage.objects for all using (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
                        and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
) with check (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
                        and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
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

// ── 07 · Endurecimiento para producción ───────────────────────────────────
// Idempotente y aditivo: sirve igual para una base nueva (tras 01–06) que
// para la base ya desplegada, porque 01 usa "create table if not exists" y
// no agrega columnas a tablas existentes.
function sqlProduccion(mods) {
  const tablas = mods.map(m => m.tabla);
  const conHija = mods.filter(m => m.child && m.hijos.length);
  const hijas  = conHija.map(m => m.tabla + '_' + snake(m.child));
  const lista  = arr => arr.map(t => "'" + t + "'").join(', ');
  // Pares hija → padre para el trigger que sella empresa_id desde el padre
  const pares  = conHija.map(m => `('${m.tabla}_${snake(m.child)}', '${m.tabla}')`).join(',\n      ');
  const petar  = mods.find(m => m.tabla === 'petar' &&
                  ['estado', 'aprobado_por'].every(c => m.campos.some(x => snake(x.nombre) === c)));

  return `-- =========================================================================
-- MOTOR PWA · Endurecimiento para producción
-- Generado por tools/gen_supabase.js — no editar a mano
--
-- Ejecutar DESPUÉS de 01–06. Es seguro correrlo varias veces.
--
--  1. actualizado_en en todas las tablas: la sincronización delta ve también
--     las EDICIONES, no solo las altas.
--  2. Autoría sellada en el servidor: el cliente ya no decide creado_por_dni
--     ni puede reasignarlo al editar (antes, si un Admin corregía el registro
--     de un Trabajador, este dejaba de verlo por el alcance 'propios').
--  3. Rol, empresa y estado del perfil se copian al JWT (app_metadata). Antes
--     solo se fijaban al crear la cuenta: cambiar el rol o cesar a alguien
--     desde la app no tenía efecto en RLS.
--  4. Nadie salvo el SuperAdmin asigna el rol superadmin ni mueve usuarios
--     entre empresas.
--  5. empresas.config + RPC guardar_config_empresa(): la configuración del
--     Admin vive en la base, no en el localStorage de un solo navegador.
--  6. Vista archivos: inventario de lo subido a Storage (solo administración).
--  7. DNI único en toda la plataforma (el login resuelve DNI → email) y DNI,
--     email e id solo cambian por la gestión de cuentas (/api/usuarios), que
--     actualiza también Supabase Auth.
--  8. RPC reemplazar_hijos(): sustituye el detalle de un registro en UNA
--     transacción (antes DELETE + INSERT sueltos: si el INSERT fallaba, el
--     detalle quedaba vacío).
--  9. Las filas hijas toman empresa_id de su registro padre.
-- 10. PETAR: nadie aprueba su propio permiso.
-- =========================================================================

-- ── Helpers (idénticos a 02_rls; se repiten para que este archivo sea autónomo)
create or replace function auth_claims() returns jsonb as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$ language sql stable;
create or replace function auth_rol() returns text as $$
  select coalesce(nullif(auth_claims() -> 'app_metadata' ->> 'rol', ''), 'trabajador');
$$ language sql stable;
create or replace function auth_empresa() returns uuid as $$
  select nullif(auth_claims() -> 'app_metadata' ->> 'empresa_id', '')::uuid;
$$ language sql stable;
create or replace function auth_dni() returns text as $$
  select coalesce(auth_claims() -> 'app_metadata' ->> 'dni', '');
$$ language sql stable;
create or replace function es_servidor() returns boolean as $$
  select coalesce(auth_claims() ->> 'role', 'service_role') = 'service_role';
$$ language sql stable;

-- ── 1 y 2 · Tablas de módulo ───────────────────────────────────────────────
create or replace function sellar_registro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actualizado_en := now();
  if tg_op = 'INSERT' then
    if not es_servidor() then
      new.creado_por     := (select id from usuarios where id = auth.uid());
      new.creado_por_dni := coalesce(nullif(auth_dni(), ''), new.creado_por_dni);
      if auth_rol() <> 'superadmin' then new.empresa_id := auth_empresa(); end if;
    end if;
  else
    -- La autoría es histórica: una edición no la reescribe.
    new.creado_por     := old.creado_por;
    new.creado_por_dni := old.creado_por_dni;
    new.creado_en      := old.creado_en;
    if not es_servidor() and auth_rol() <> 'superadmin' then new.empresa_id := old.empresa_id; end if;
  end if;
  return new;
end $$;

-- La empresa de una fila hija es SIEMPRE la de su padre (argumento del
-- trigger = tabla padre). security definer solo para poder leer el padre al
-- sellar; quién puede escribir lo siguen decidiendo las políticas RLS, que
-- exigen que ese padre sea de la empresa de quien escribe.
create or replace function sellar_hijo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  new.actualizado_en := now();
  if tg_nargs > 0 then
    execute format('select empresa_id from %I where uuid = $1', tg_argv[0]) into v_empresa using new.parent_uuid;
    if v_empresa is not null then new.empresa_id := v_empresa; end if;
  elsif tg_op = 'INSERT' and not es_servidor() and auth_rol() <> 'superadmin' then
    new.empresa_id := auth_empresa();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[${lista(tablas)}] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I add column if not exists actualizado_en timestamptz not null default now()', t);
    execute format('create index if not exists %I on %I (empresa_id, actualizado_en)', 'idx_' || t || '_actualizado', t);
    execute format('drop trigger if exists trg_%s_sellar on %I', t, t);
    execute format('create trigger trg_%s_sellar before insert or update on %I for each row execute function sellar_registro()', t, t);
  end loop;

end $$;

do $$
declare r record;
begin
  for r in select * from (values
      ${pares || "(null::text, null::text)"}
    ) as x(hija, padre) loop
    if r.hija is null or to_regclass('public.' || r.hija) is null then continue; end if;
    execute format('alter table %I add column if not exists actualizado_en timestamptz not null default now()', r.hija);
    execute format('drop trigger if exists trg_%s_sellar on %I', r.hija, r.hija);
    execute format('create trigger trg_%s_sellar before insert or update on %I for each row execute function sellar_hijo(%L)', r.hija, r.hija, r.padre);
  end loop;
end $$;

-- ── 8 · Reemplazo atómico del detalle ──────────────────────────────────────
-- security invoker: corre con los permisos de quien llama, así que las
-- políticas de la tabla hija deciden si puede borrar e insertar. Como todo
-- ocurre en una transacción, si el INSERT falla el DELETE se deshace.
create or replace function reemplazar_hijos(p_tabla text, p_parent text, p_filas jsonb)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_cols    text;
  v_sel     text;
  v_visibles integer;
  v_borradas integer;
  n         integer := 0;
begin
  if p_tabla is null or p_tabla not in (${lista(hijas) || "''"}) then
    raise exception 'Tabla hija no permitida: %', p_tabla using errcode = '42501';
  end if;
  if coalesce(p_parent, '') = '' then
    raise exception 'Falta el registro padre.' using errcode = '22023';
  end if;

  -- RLS filtra en silencio un DELETE no permitido (0 filas, sin error). Si
  -- se ven filas que no se pudieron borrar, no hay permiso: se avisa en vez
  -- de devolver "guardado" sin haber guardado nada.
  execute format('select count(*) from %I where parent_uuid = $1', p_tabla) into v_visibles using p_parent;
  execute format('delete from %I where parent_uuid = $1', p_tabla) using p_parent;
  get diagnostics v_borradas = row_count;
  if v_borradas < v_visibles then
    raise exception 'No tienes permiso para modificar el detalle de este registro.' using errcode = '42501';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return 0;
  end if;

  -- Solo columnas reales de la tabla que vengan en las filas; parent_uuid se
  -- fuerza al padre indicado (una fila no puede colgarse de otro registro).
  select string_agg(quote_ident(c), ', ' order by c),
         string_agg(case when c = 'parent_uuid' then '$2' else quote_ident(c) end, ', ' order by c)
    into v_cols, v_sel
    from (select column_name::text as c
            from information_schema.columns
           where table_schema = 'public' and table_name = p_tabla
             and column_name not in ('id', 'creado_en', 'actualizado_en')
             and (column_name = 'parent_uuid'
                  or column_name in (select jsonb_object_keys(e) from jsonb_array_elements(p_filas) e))) s;

  execute format('insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1)',
                 p_tabla, v_cols, v_sel, p_tabla)
    using p_filas, p_parent;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function reemplazar_hijos(text, text, jsonb) from public;
grant execute on function reemplazar_hijos(text, text, jsonb) to authenticated;
${petar ? `
-- ── 10 · PETAR: segregación de funciones ───────────────────────────────────
-- Quien solicita el permiso no puede figurar como su aprobador. Solo se valida
-- cuando cambia el aprobador o el permiso pasa a Aprobado, para no bloquear el
-- cierre de permisos antiguos. (El nombre empieza por "trg_petar_v" para que
-- corra DESPUÉS de trg_petar_sellar, que fija creado_por_dni.)
create or replace function validar_aprobacion_petar() returns trigger
language plpgsql as $$
begin
  if es_servidor() then return new; end if;
  if (tg_op = 'INSERT' or new.aprobado_por is distinct from old.aprobado_por
      or (new.estado = 'Aprobado' and old.estado is distinct from 'Aprobado'))
     and nullif(new.aprobado_por, '') is not null
     and new.aprobado_por = new.creado_por_dni then
    raise exception 'Un PETAR no puede aprobarlo la misma persona que lo solicitó.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_petar_validar_aprobacion on petar;
create trigger trg_petar_validar_aprobacion before insert or update on petar
  for each row execute function validar_aprobacion_petar();
` : ''}

-- ── 3 y 4 · Usuarios ───────────────────────────────────────────────────────
alter table usuarios add column if not exists foto_perfil    text;
alter table usuarios add column if not exists firma_cargo    text;
alter table usuarios add column if not exists actualizado_en timestamptz not null default now();
alter table usuarios add column if not exists consentimiento_fecha text;
alter table usuarios add column if not exists consentimiento_folio text;
alter table usuarios add column if not exists consentimiento_path  text;

create or replace function proteger_usuarios() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  if es_servidor() then return new; end if;
  -- Las cuentas nacen en /api/usuarios (crea a la vez el usuario de Auth).
  -- Un perfil insertado a mano quedaría sin cuenta o enlazado a la de otro.
  if tg_op = 'INSERT' and auth_rol() <> 'superadmin' then
    raise exception 'Las cuentas se crean desde Usuarios → Nuevo (servicio de cuentas).' using errcode = '42501';
  end if;
  -- DNI y email son la llave del login (DNI → email → Supabase Auth): si se
  -- cambian solo aquí, el usuario deja de poder entrar, y un DNI ajeno
  -- secuestraría el login de otra persona. Se cambian por /api/usuarios.
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.dni is distinct from old.dni
                           or new.email is distinct from old.email) then
    raise exception 'El DNI y el correo se cambian desde la gestión de cuentas.' using errcode = '42501';
  end if;
  if auth_rol() = 'superadmin' then return new; end if;
  if new.rol = 'superadmin' then
    raise exception 'Solo el proveedor del servicio puede asignar el rol superadmin.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.empresa_id is distinct from old.empresa_id then
      raise exception 'Un usuario no puede cambiar de empresa.' using errcode = '42501';
    end if;
    if new.id = auth.uid() and (new.rol is distinct from old.rol or new.status is distinct from old.status) then
      raise exception 'No puedes cambiar tu propio rol ni tu estado.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_usuarios_proteger on usuarios;
create trigger trg_usuarios_proteger before insert or update on usuarios
  for each row execute function proteger_usuarios();

-- DNI único en TODA la plataforma: login_email_de_dni() busca por DNI sin
-- saber la empresa. Con duplicados el login de una persona podía resolver al
-- email de otra. Si ya existen duplicados no se crea (se avisa) para no
-- abortar el resto del archivo: corrígelos y vuelve a ejecutarlo.
do $$
begin
  if exists (select 1 from usuarios group by dni having count(*) > 1) then
    raise warning 'Hay DNIs repetidos entre empresas: no se creó usuarios_dni_unico. Revisa: select dni, count(*) from usuarios group by dni having count(*) > 1;';
  else
    create unique index if not exists usuarios_dni_unico on usuarios (dni);
  end if;
end $$;

-- Copia rol/empresa/dni al JWT. Un usuario Cesado o Inactivo pierde la
-- empresa en sus claims (RLS deja de devolverle filas) y queda baneado, lo
-- que invalida su refresh_token: como máximo conserva acceso hasta que
-- caduque el access_token vigente (1 h).
create or replace function sync_claims_usuario() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare bloqueado boolean := lower(coalesce(new.status, '')) in ('cesado', 'inactivo');
begin
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'rol',        case when bloqueado then 'bloqueado' else new.rol end,
      'empresa_id', case when bloqueado then null else new.empresa_id end,
      'dni',        new.dni),
    banned_until = case when bloqueado then 'infinity'::timestamptz else null end
  where id = new.id;
  return new;
end $$;
drop trigger if exists trg_usuarios_claims on usuarios;
create trigger trg_usuarios_claims after insert or update of rol, empresa_id, dni, status on usuarios
  for each row execute function sync_claims_usuario();

-- ── 5 · Configuración por empresa ──────────────────────────────────────────
alter table empresas add column if not exists config jsonb not null default '{}'::jsonb;

-- empresas_mod solo deja escribir al SuperAdmin (plan y módulos son suyos).
-- El Admin necesita guardar SU configuración sin poder tocar plan/módulos:
-- por eso pasa por esta función y no por un UPDATE directo.
create or replace function guardar_config_empresa(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth_rol() not in ('admin', 'superadmin') or auth_empresa() is null then
    raise exception 'Solo el administrador de la empresa puede cambiar la configuración.' using errcode = '42501';
  end if;
  -- La config viaja en cada inicio de sesión: un objeto plano y pequeño
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then
    raise exception 'La configuración debe ser un objeto JSON.' using errcode = '22023';
  end if;
  if pg_column_size(p_config) > 65536 then
    raise exception 'La configuración supera el tamaño permitido (64 KB).' using errcode = '22023';
  end if;
  update empresas set config = coalesce(config, '{}'::jsonb) || coalesce(p_config, '{}'::jsonb)
   where id = auth_empresa()
  returning config into r;
  return r;
end $$;
revoke all on function guardar_config_empresa(jsonb) from public;
grant execute on function guardar_config_empresa(jsonb) to authenticated;

-- ── 6 · Inventario de archivos (datos no estructurados) ────────────────────
-- security_invoker: la vista respeta las políticas de storage.objects (cada
-- empresa solo ve sus archivos) y además es solo para administración: el
-- inventario completo no es una vista de trabajo de campo.
create or replace view archivos with (security_invoker = true) as
select
  o.bucket_id                                        as bucket,
  o.name                                             as ruta,
  nullif(split_part(o.name, '/', 1), '')             as empresa_id,
  nullif(split_part(o.name, '/', 2), '')             as modulo,
  nullif(split_part(o.name, '/', 3), '')             as registro_uuid,
  nullif(split_part(o.name, '/', 4), '')             as archivo,
  o.metadata ->> 'mimetype'                          as mime,
  nullif(o.metadata ->> 'size', '')::bigint          as bytes,
  o.owner                                            as subido_por,
  o.created_at                                       as subido_en
from storage.objects o
where o.bucket_id in ('evidencias', 'documentos', 'informes', 'publico')
  and auth_rol() in ('admin', 'superadmin');
grant select on archivos to authenticated;

-- ── Storage: tipos admitidos en documentos (Material de capacitación) ──────
update storage.buckets set allowed_mime_types = array[
  'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword','application/vnd.ms-excel','text/csv','text/plain',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint','image/jpeg','image/png']
where id = 'documentos';

-- ── Resincroniza los claims de los usuarios que ya existen ─────────────────
update usuarios set dni = dni;
`;
}

// ── 08 · Rendimiento: índices y agregados ─────────────────────────────────
/**
 * Lo que convierte "miles de registros" en un problema o en un no-problema.
 *
 *  1. Índices. Sin ellos, cada página del Resumen y cada conteo de KPI es un
 *     recorrido secuencial de la tabla entera: con 500 filas no se nota, con
 *     80 000 son segundos por consulta y la app parece colgada. Se indexa
 *     exactamente lo que la app consulta de verdad:
 *       · (empresa_id, creado_en desc) → el orden de la paginación
 *       · (empresa_id, <campo>)        → cada campo con filtro propio (isFilter)
 *       · gin_trgm(<campo>)            → los filtros de texto, que son ILIKE
 *                                        parcial y un btree no puede resolver
 *
 *  2. motor_agregado(). Cuenta y suma EN LA BASE. Es la pieza que permite
 *     paginar sin romper los tableros: la tabla muestra 50 filas, pero
 *     "12 vencidos" sale de recorrer las 80 000 en Postgres. Sin esto habría
 *     que elegir entre un tablero correcto y una app que no se arrastre.
 */
function sqlRendimiento(mods) {
  const L = [];
  L.push('-- =========================================================================');
  L.push('-- MOTOR PWA · Rendimiento con miles de registros');
  L.push('-- Generado por tools/gen_supabase.js — no editar a mano');
  L.push('--');
  L.push('-- Idempotente: se puede volver a ejecutar sobre una base ya desplegada.');
  L.push('-- CREATE INDEX bloquea escrituras mientras construye el índice; sobre');
  L.push('-- una tabla ya grande conviene cambiarlo a CREATE INDEX CONCURRENTLY');
  L.push('-- (que no se puede usar dentro de una transacción).');
  L.push('-- =========================================================================');
  L.push('');
  L.push('create extension if not exists pg_trgm;');
  L.push('');

  mods.forEach(m => {
    L.push('-- ── ' + m.modulo + ' ' + '─'.repeat(Math.max(0, 62 - m.modulo.length)));
    // El orden exacto de la paginación del Resumen.
    L.push('create index if not exists idx_' + m.tabla + '_pagina on ' + m.tabla +
           ' (empresa_id, creado_en desc);');
    m.campos.filter(c => c.filtro).forEach(c => {
      const col = snake(c.nombre);
      const t = String(c.tipo || '').toLowerCase();
      const esFecha = t === 'date' || col.indexOf('fecha') === 0;
      if (esFecha || t === 'number' || t === 'enum') {
        // Igualdad y rangos: btree compuesto con la empresa, que va en TODA consulta.
        L.push('create index if not exists idx_' + m.tabla + '_' + col + ' on ' + m.tabla +
               ' (empresa_id, ' + col + ');');
      } else {
        // Texto libre: el filtro es ILIKE '%algo%' y solo un índice de trigramas
        // lo resuelve. Un btree no sirve para un comodín por delante.
        L.push('create index if not exists idx_' + m.tabla + '_' + col + '_txt on ' + m.tabla +
               ' using gin (' + col + ' gin_trgm_ops);');
      }
    });
    if (m.child && m.hijos.length) {
      const th = m.tabla + '_' + snake(m.child);
      L.push('create index if not exists idx_' + th + '_empresa on ' + th + ' (empresa_id);');
    }
    L.push('');
  });

  L.push('-- ── Conteos y sumas en la base, no en el navegador ────────────────────');
  L.push('--');
  L.push('-- Un KPI NO puede contar sobre las filas cargadas: con la tabla paginada');
  L.push('-- dejaria fuera todo lo que no esta en pantalla (una inspeccion vencida');
  L.push('-- de hace ocho meses) y el tablero mentiria sin avisar.');
  L.push('--');
  L.push('-- security invoker: se ejecuta con los permisos de quien llama, asi que');
  L.push('-- el RLS se aplica igual que en una consulta normal. Un trabajador');
  L.push('-- cuenta solo lo suyo. NO cambiar a security definer: convertiria esta');
  L.push('-- funcion en un agujero para leer la base de otras empresas.');
  L.push('--');
  L.push('-- Los identificadores pasan por format(%I) y los valores por %L, de modo');
  L.push('-- que no hay inyeccion posible desde p_cond; ademas tabla y columnas se');
  L.push('-- validan contra la lista blanca y el catalogo.');
  L.push('');
  L.push(`-- WHERE a partir de las condiciones declarativas del KPI.
-- Es recursiva porque el lenguaje admite alternativas con "$o":
--   { "$o": [ { "fecha": {"lt":"2026-11-23"} },
--             { "fecha": {"eq":"2026-11-23"}, "hora_fin": {"lt":"10:30"} } ] }
-- Sin esa pieza, un KPI como "permisos vencidos sin cerrar" (fecha anterior O
-- misma fecha con la hora ya pasada) solo se podria aproximar.
create or replace function motor_cond_sql(p_tabla text, p_cond jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $cond$
declare
  v_where text := 'true';
  v_col   text;
  v_ops   jsonb;
  v_op    text;
  v_val   jsonb;
  v_txt   text;
  v_alt   jsonb;
  v_partes text[] := '{}';
begin
  for v_col, v_ops in select key, value from jsonb_each(coalesce(p_cond, '{}'::jsonb)) loop

    -- Alternativas: cualquiera de las condiciones de la lista
    if v_col = '$o' then
      if jsonb_typeof(v_ops) <> 'array' then
        raise exception 'motor_cond_sql: $o espera una lista de condiciones';
      end if;
      for v_alt in select value from jsonb_array_elements(v_ops) loop
        v_partes := v_partes || ('(' || motor_cond_sql(p_tabla, v_alt) || ')');
      end loop;
      if array_length(v_partes, 1) > 0 then
        v_where := v_where || ' and (' || array_to_string(v_partes, ' or ') || ')';
      end if;
      v_partes := '{}';
      continue;
    end if;

    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = p_tabla and column_name = v_col) then
      raise exception 'motor_cond_sql: columna desconocida (%.%)', p_tabla, v_col;
    end if;

    if jsonb_typeof(v_ops) <> 'object' then
      v_where := v_where || format(' and %I::text = %L', v_col, v_ops #>> '{}');
      continue;
    end if;

    for v_op, v_val in select key, value from jsonb_each(v_ops) loop
      v_txt := v_val #>> '{}';
      if v_op = 'eq' then
        v_where := v_where || format(' and %I::text = %L', v_col, v_txt);
      elsif v_op = 'neq' then
        v_where := v_where || format(' and %I::text <> %L', v_col, v_txt);
      elsif v_op = 'like' then
        v_where := v_where || format(' and %I::text ilike %L', v_col, '%' || v_txt || '%');
      elsif v_op = 'nulo' then
        if v_txt = 'true' then v_where := v_where || format(' and %I is null', v_col);
        else                   v_where := v_where || format(' and %I is not null', v_col);
        end if;
      elsif v_op = 'in' then
        if jsonb_typeof(v_val) <> 'array' then
          raise exception 'motor_cond_sql: el operador in espera una lista';
        end if;
        v_where := v_where || format(' and %I::text = any (select jsonb_array_elements_text(%L::jsonb))',
                                     v_col, v_val::text);
      elsif v_op in ('lt', 'lte', 'gt', 'gte') then
        -- Comparacion con el tipo real de la columna (una fecha como fecha).
        -- Un NULL no cumple ninguna desigualdad, que es justo lo que se quiere:
        -- una inspeccion SIN plazo no esta vencida.
        v_where := v_where || format(' and %I %s %L', v_col,
          case v_op when 'lt' then '<' when 'lte' then '<=' when 'gt' then '>' else '>=' end, v_txt);
      else
        raise exception 'motor_cond_sql: operador no permitido (%)', v_op;
      end if;
    end loop;
  end loop;
  return v_where;
end
$cond$;

create or replace function motor_agregado(
  p_tabla   text,
  p_metrica text default 'count',
  p_columna text default null,
  p_cond    jsonb default '{}'::jsonb
) returns text
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_tablas text[] := array[${mods.map(m => "'" + m.tabla + "'").join(', ')}];
  v_expr   text;
  v_sql    text;
  v_res    text;
begin
  if p_tabla is null or not (p_tabla = any (v_tablas)) then
    raise exception 'motor_agregado: tabla no permitida (%)', p_tabla;
  end if;
  if p_metrica not in ('count', 'sum', 'max', 'min', 'avg') then
    raise exception 'motor_agregado: metrica no permitida (%)', p_metrica;
  end if;

  if p_metrica = 'count' then
    v_expr := 'count(*)';
  else
    if p_columna is null or not exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = p_tabla and column_name = p_columna) then
      raise exception 'motor_agregado: columna desconocida para % (%.%)', p_metrica, p_tabla, p_columna;
    end if;
    v_expr := format('%s(%I)', p_metrica, p_columna);
  end if;

  v_sql := format('select (%s)::text from %I where %s',
                  v_expr, p_tabla, motor_cond_sql(p_tabla, p_cond));
  execute v_sql into v_res;
  return v_res;
end
$fn$;`);
  L.push('');
  L.push('revoke all on function motor_cond_sql(text, jsonb) from public, anon;');
  L.push('grant execute on function motor_cond_sql(text, jsonb) to authenticated;');
  L.push('revoke all on function motor_agregado(text, text, text, jsonb) from public, anon;');
  L.push('grant execute on function motor_agregado(text, text, text, jsonb) to authenticated;');
  L.push('');
  L.push('-- Planificador al dia: sin esto los indices nuevos tardan en usarse.');
  mods.forEach(m => L.push('analyze ' + m.tabla + ';'));
  L.push('');
  return L.join('\n');
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
  ['supabase_04_seed.sql',    sqlSeed(mods)],
  ['supabase_07_produccion.sql', sqlProduccion(mods)],
  ['supabase_08_rendimiento.sql', sqlRendimiento(mods)]
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
console.log('\nEjecutar en el editor SQL de Supabase EN ESTE ORDEN: 01, 02, 03, 04, 05, 06, 07, 08, 09.');
console.log('Base ya desplegada: basta con 02, 03, 05, 06, 07, 08 y 09 (todos idempotentes). 05, 06 y 09 estan escritos a mano.');
