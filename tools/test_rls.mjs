/**
 * tools/test_rls.mjs — pruebas de seguridad del SQL generado
 * =========================================================================
 * Aplica supabase_01…07 en un Postgres real embebido (PGlite, sin Docker ni
 * credenciales), con stubs de los esquemas auth y storage de Supabase, y
 * ataca las políticas con usuarios de cada rol y de dos empresas.
 *
 *   npm i --no-save @electric-sql/pglite@0.2.17   (una sola vez)
 *   node tools/gen_supabase.js && node tools/test_rls.mjs
 *
 * Ejecutarlo SIEMPRE tras cambiar gen_supabase.js, un subconfig (su matriz
 * de roles genera las políticas) o supabase_05_login.sql.
 * =========================================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch (e) {
  console.error('Falta PGlite. Instálalo sin tocar package.json:\n  npm i --no-save @electric-sql/pglite@0.2.17');
  process.exit(2);
}

const TOOLS = process.argv[2] || path.dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
let fallos = 0, ok = 0;
const log = (b, m) => { b ? ok++ : fallos++; console.log((b ? '  ✔ ' : '  ✘ ') + m); };

// ── Stubs de Supabase ────────────────────────────────────────────────────
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb, banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
                                owner uuid, metadata jsonb default '{}'::jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant all on storage.objects, storage.buckets to authenticated;
`);

for (const f of ['supabase_01_schema.sql', 'supabase_02_rls.sql', 'supabase_03_storage.sql',
                 'supabase_04_seed.sql', 'supabase_05_login.sql', 'supabase_06_migracion_incidentes_flash.sql',
                 'supabase_07_produccion.sql', 'supabase_08_rendimiento.sql']) {
  let sql = fs.readFileSync(path.join(TOOLS, f), 'utf8');
  sql = sql.replace(/create extension if not exists "pgcrypto";/, '');
  // PGlite no trae pg_trgm: los indices de texto se omiten en la prueba. Lo
  // que importa validar aqui es el SQL de motor_agregado y que el RLS se le
  // aplique; los indices no cambian el resultado, solo el tiempo.
  sql = sql.replace(/create extension if not exists pg_trgm;/, '')
           .replace(/^create index if not exists \S+ on \S+ using gin [^;]+;$/gm, '');
  try { await db.exec(sql); console.log('SQL ' + f + ' aplicado'); }
  catch (e) { console.log('✘ SQL ' + f + ': ' + e.message); fallos++; }
  if (f === 'supabase_01_schema.sql') {
    await db.exec(`grant usage on schema public to anon, authenticated;
      grant all on all tables in schema public to authenticated;
      grant all on all sequences in schema public to authenticated;`);
  }
}
// Las funciones creadas después también deben ser ejecutables
await db.exec(`grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;`);

// ── Datos: 2 empresas, usuarios en todos los roles ───────────────────────
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const U = {
  super: { id: '10000000-0000-0000-0000-000000000001', dni: '90000001', rol: 'superadmin', emp: A },
  adminA:{ id: '10000000-0000-0000-0000-000000000002', dni: '11111111', rol: 'admin',      emp: A },
  supA:  { id: '10000000-0000-0000-0000-000000000003', dni: '22222222', rol: 'supervisor', emp: A },
  trabA: { id: '10000000-0000-0000-0000-000000000004', dni: '33333333', rol: 'trabajador', emp: A },
  trabA2:{ id: '10000000-0000-0000-0000-000000000005', dni: '44444444', rol: 'trabajador', emp: A },
  adminB:{ id: '10000000-0000-0000-0000-000000000006', dni: '55555555', rol: 'admin',      emp: B },
  cesado:{ id: '10000000-0000-0000-0000-000000000007', dni: '66666666', rol: 'trabajador', emp: A, status: 'Cesado' },
};
await db.exec(`insert into empresas (id, nombre) values ('${A}', 'Empresa A'), ('${B}', 'Empresa B');`);
for (const [k, u] of Object.entries(U)) {
  await db.exec(`insert into auth.users (id, email) values ('${u.id}', '${k}@x.com');
    insert into usuarios (id, empresa_id, dni, nombre, email, rol, status)
    values ('${u.id}', '${u.emp}', '${u.dni}', '${k}', '${k}@x.com', '${u.rol}', '${u.status || 'Activo'}');`);
}
const claims = await db.query(`select raw_app_meta_data, banned_until from auth.users where id = '${U.cesado.id}'`);
log(claims.rows[0].raw_app_meta_data.rol === 'bloqueado' && claims.rows[0].banned_until, 'Cesado: JWT sin empresa y cuenta baneada (sync_claims_usuario)');

// Ejecuta como un usuario (rol authenticated + claims del JWT)
async function como(u, sql, params) {
  const c = JSON.stringify({ sub: u.id, role: 'authenticated', app_metadata: { rol: u.rol, empresa_id: u.emp, dni: u.dni } });
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [c]);
    await tx.query('set local role authenticated');
    return tx.query(sql, params || []);
  });
}
async function debeFallar(u, sql, msg) {
  try { const r = await como(u, sql); log(r.affectedRows === 0 && /^\s*(update|delete)/i.test(sql), msg + (r.affectedRows === 0 ? ' (0 filas)' : ' — ¡PERMITIDO!')); }
  catch (e) { log(true, msg + ' → ' + e.message.split('\n')[0].slice(0, 90)); }
}
async function debePasar(u, sql, msg) {
  try { const r = await como(u, sql); log(!(/^\s*(update|delete)/i.test(sql)) || r.affectedRows > 0, msg + (r.affectedRows != null ? ' (' + r.affectedRows + ' filas)' : '')); return r; }
  catch (e) { log(false, msg + ' → ' + e.message.split('\n')[0]); }
}

console.log('\n── Tablas de módulo (A4)');
await debeFallar(U.trabA, `insert into iperc (empresa_id, uuid, proceso) values ('${A}', 'IPC-T1', 'x')`, 'Trabajador NO crea IPERC (canCreate:false)');
await debePasar(U.supA, `insert into iperc (empresa_id, uuid, proceso) values ('${A}', 'IPC-S1', 'x')`, 'Supervisor crea IPERC');
await debePasar(U.trabA, `insert into petar (empresa_id, uuid, estado, supervisor_dni) values ('${A}', 'PTR-T1', 'Solicitado', '${U.supA.dni}')`, 'Trabajador crea PETAR (canCreate:true) nombrando a su supervisor');
await debeFallar(U.trabA, `update petar set descripcion = 'x' where uuid = 'PTR-T1'`, 'Trabajador NO edita su PETAR (canUpdate:false)');
await debePasar(U.adminB, `insert into petar (empresa_id, uuid) values ('${A}', 'PTR-B1')`, 'Admin B intenta insertar con empresa_id de A…');
const pb = await db.query(`select empresa_id from petar where uuid = 'PTR-B1'`);
log(pb.rows[0].empresa_id === B, '…y el trigger lo deja en SU empresa (B), nunca en A');
const sello = await db.query(`select empresa_id, creado_por_dni from petar where uuid = 'PTR-T1'`);
log(sello.rows[0].creado_por_dni === U.trabA.dni, 'Autoría sellada en el servidor (creado_por_dni)');

console.log('\n── Tablas hijas (A1)');
await debePasar(U.supA, `insert into petar (empresa_id, uuid, estado, ejecutante_dni) values ('${A}', 'PTR-S1', 'Solicitado', '${U.trabA.dni}')`, 'Supervisor crea PETAR con Trabajador como ejecutante');
await debePasar(U.supA, `insert into petar_verificaciones (empresa_id, parent_uuid, item, cumple) values ('${A}', 'PTR-S1', 'Arnés', 'Sí')`, 'Supervisor añade verificación a su PETAR');
await debeFallar(U.trabA, `insert into petar_verificaciones (empresa_id, parent_uuid, item) values ('${A}', 'PTR-S1', 'falso')`, 'Trabajador (solo ejecutante) NO añade verificaciones');
await debeFallar(U.trabA, `delete from petar_verificaciones where parent_uuid = 'PTR-S1'`, 'Trabajador (solo ejecutante) NO borra verificaciones');
await debeFallar(U.trabA, `update petar_verificaciones set cumple = 'No' where parent_uuid = 'PTR-S1'`, 'Trabajador (solo ejecutante) NO altera verificaciones');
const ve = await como(U.trabA, `select count(*)::int n from petar_verificaciones where parent_uuid = 'PTR-S1'`);
log(ve.rows[0].n === 1, 'Trabajador ejecutante SÍ ve las verificaciones (lectura intacta)');
await debePasar(U.trabA, `insert into petar_verificaciones (empresa_id, parent_uuid, item) values ('${A}', 'PTR-T1', 'mío')`, 'Trabajador completa el detalle de SU PETAR recién creado (<24 h)');
await db.exec(`alter table petar disable trigger user;
  update petar set creado_en = now() - interval '2 days' where uuid = 'PTR-T1';
  alter table petar enable trigger user;`);
await debeFallar(U.trabA, `insert into petar_verificaciones (empresa_id, parent_uuid, item) values ('${A}', 'PTR-T1', 'tarde')`, 'Trabajador NO modifica el detalle pasadas 24 h');
await debeFallar(U.adminB, `insert into petar_verificaciones (empresa_id, parent_uuid, item) values ('${B}', 'PTR-S1', 'cruzado')`, 'Admin B NO cuelga hijos de un registro de la empresa A');
await debePasar(U.supA, `insert into charlas (empresa_id, uuid, tema) values ('${A}', 'CHL-S1', 'Orden y limpieza')`, 'Supervisor registra una charla');
await debeFallar(U.trabA2, `insert into charlas_asistentes (empresa_id, parent_uuid, nombre) values ('${A}', 'CHL-S1', 'falso')`, 'Trabajador ajeno NO inserta asistentes');
const est = await db.query(`select empresa_id from petar_verificaciones where parent_uuid = 'PTR-S1'`);
log(est.rows.every(r => r.empresa_id === A), 'empresa_id de la hija se sella desde el padre');

console.log('\n── RPC reemplazar_hijos (A5)');
await debePasar(U.supA, `select reemplazar_hijos('petar_verificaciones', 'PTR-S1', '[{"item":"Casco","cumple":"Sí","empresa_id":"${A}"},{"item":"Guantes","cumple":"No"}]'::jsonb)`, 'Supervisor reemplaza el detalle');
let n = await db.query(`select string_agg(item, ',' order by item) s from petar_verificaciones where parent_uuid = 'PTR-S1'`);
log(n.rows[0].s === 'Casco,Guantes', 'Detalle = exactamente las filas nuevas (' + n.rows[0].s + ')');
await debeFallar(U.supA, `select reemplazar_hijos('petar_verificaciones', 'PTR-S1', '[{"item":"X","creado_en":"no-es-fecha","cumple":"Sí"},{"item":"Y","parent_uuid":"OTRO"}]'::jsonb), reemplazar_hijos('petar_verificaciones', 'PTR-NOEXISTE', '[{"item":"Z"}]'::jsonb)`, 'Un INSERT que falla aborta la operación');
n = await db.query(`select string_agg(item, ',' order by item) s from petar_verificaciones where parent_uuid = 'PTR-S1'`);
log(n.rows[0].s === 'Casco,Guantes', 'Tras el fallo el detalle anterior sigue intacto (' + n.rows[0].s + ')');
await debeFallar(U.trabA, `select reemplazar_hijos('petar_verificaciones', 'PTR-S1', '[]'::jsonb)`, 'Trabajador NO vacía el detalle vía RPC');
n = await db.query(`select count(*)::int c from petar_verificaciones where parent_uuid = 'PTR-S1'`);
log(n.rows[0].c === 2, 'El intento del Trabajador no borró nada (' + n.rows[0].c + ' filas)');
await debeFallar(U.supA, `select reemplazar_hijos('usuarios', 'x', '[]'::jsonb)`, 'RPC rechaza tablas fuera de la lista blanca');

console.log('\n── PETAR: segregación (A4)');
await debeFallar(U.supA, `insert into petar (empresa_id, uuid, estado, aprobado_por) values ('${A}', 'PTR-S2', 'Aprobado', '${U.supA.dni}')`, 'Supervisor NO aprueba su propio PETAR');
await debePasar(U.supA, `update petar set estado = 'Aprobado', aprobado_por = '${U.supA.dni}' where uuid = 'PTR-T1'`, 'Supervisor SÍ aprueba el PETAR de otro');

console.log('\n── Usuarios (A3)');
await debeFallar(U.adminA, `update usuarios set dni = '${U.adminB.dni}' where id = '${U.trabA.id}'`, 'Admin NO cambia DNIs por PATCH directo');
await debeFallar(U.adminA, `update usuarios set email = 'otro@x.com' where id = '${U.trabA.id}'`, 'Admin NO cambia emails por PATCH directo');
await debeFallar(U.adminA, `insert into usuarios (id, empresa_id, dni, nombre, rol) values ('${U.adminB.id}', '${A}', '77777777', 'x', 'trabajador')`, 'Admin NO inserta perfiles a mano');
await debePasar(U.adminA, `update usuarios set nombre = 'Nuevo nombre' where id = '${U.trabA.id}'`, 'Admin SÍ edita nombre/área/rol');
await debeFallar(U.adminA, `update usuarios set rol = 'superadmin' where id = '${U.trabA.id}'`, 'Admin NO asigna superadmin');
try { await db.exec(`insert into auth.users (id) values ('20000000-0000-0000-0000-000000000001');
  insert into usuarios (id, empresa_id, dni, nombre) values ('20000000-0000-0000-0000-000000000001', '${B}', '${U.trabA.dni}', 'dup')`);
  log(false, 'DNI duplicado entre empresas — ¡PERMITIDO!'); }
catch (e) { log(/usuarios_dni_unico/.test(e.message), 'DNI único en toda la plataforma (incluso entre empresas)'); }

console.log('\n── Storage (A2)');
await db.exec(`insert into storage.objects (bucket_id, name) values
  ('evidencias', '${A}/08_PETAR/PTR-S1/Firma_Aprobador_0_a.png'),
  ('evidencias', '${A}/08_PETAR/PTR-T1/Firma_Solicitante_0_b.png'),
  ('evidencias', '${A}/09_EPP/EPP-OTRO/Firma_Trabajador_0_c.png'),
  ('evidencias', '${A}/01_Usuarios/${U.supA.id}/Firma_Cargo_0_d.png'),
  ('evidencias', 'sin-empresa/x/y/z.png'),
  ('evidencias', '${B}/08_PETAR/PTR-B/Firma_0_e.png')`);
let r = await como(U.trabA, `select name from storage.objects order by name`);
const vistos = r.rows.map(x => x.name.split('/').slice(1, 3).join('/'));
log(vistos.join(' | ') === '08_PETAR/PTR-S1 | 08_PETAR/PTR-T1', 'Trabajador solo ve archivos de registros que puede ver: ' + vistos.join(' | '));
r = await como(U.supA, `select count(*)::int n from storage.objects`);
log(r.rows[0].n === 3, 'Supervisor: su PETAR + el PETAR donde es supervisor + su firma (' + r.rows[0].n + ')');
r = await como(U.adminA, `select count(*)::int n from storage.objects`);
log(r.rows[0].n === 4, 'Admin A ve todo lo de su empresa y nada de B (' + r.rows[0].n + ')');
await debeFallar(U.trabA, `update storage.objects set metadata = '{"x":1}' where name like '%PTR-T1%'`, 'Trabajador NO sobrescribe evidencia');
await debeFallar(U.supA, `delete from storage.objects where name like '%PTR-S1%'`, 'Supervisor NO borra evidencia');
await debePasar(U.trabA, `insert into storage.objects (bucket_id, name) values ('evidencias', '${A}/08_PETAR/PTR-T1/Foto_1_z.jpg')`, 'Trabajador sube evidencia nueva');
await debeFallar(U.trabA, `insert into storage.objects (bucket_id, name) values ('evidencias', '${B}/08_PETAR/PTR-B/x.jpg')`, 'Trabajador NO sube a la carpeta de otra empresa');
await debeFallar(U.adminA, `insert into storage.objects (bucket_id, name) values ('publico', '${B}/logo.png')`, 'Admin A NO sube logos en la carpeta pública de B');
r = await como(U.trabA, `select count(*)::int n from archivos`);
log(r.rows[0].n === 0, 'Vista archivos vacía para el Trabajador');
r = await como(U.adminA, `select count(*)::int n from archivos`);
log(r.rows[0].n > 0, 'Vista archivos disponible para el Admin (' + r.rows[0].n + ')');
const pub = await db.query(`select allowed_mime_types from storage.buckets where id = 'publico'`);
log(!pub.rows[0].allowed_mime_types.includes('image/svg+xml'), 'Bucket publico sin SVG');

console.log('\n── Informes PDF: el documento de cada registro (bucket informes)');
// El informe es un documento DERIVADO: se regenera del registro en cada
// cambio, siempre con el mismo nombre. Por eso no vive con las evidencias
// (donde sobrescribir y borrar son del Admin): aquí lo reescribe quien puede
// editar el registro, más su autor, y se borra con el registro.
const inf = (emp, mod, uuid) => `${emp}/${mod}/${uuid}/informe.pdf`;
const bi = await db.query(`select public, allowed_mime_types from storage.buckets where id = 'informes'`);
log(bi.rows[0] && bi.rows[0].public === false && String(bi.rows[0].allowed_mime_types) === 'application/pdf',
    'Bucket informes: privado y solo PDF');
await debePasar(U.trabA, `insert into storage.objects (bucket_id, name) values ('informes', '${inf(A, '08_PETAR', 'PTR-T1')}')`,
  'El autor archiva el informe de su registro aunque no pueda editarlo (canUpdate:false)');
await debeFallar(U.trabA, `insert into storage.objects (bucket_id, name) values ('informes', '${inf(A, '08_PETAR', 'PTR-S1')}')`,
  'Trabajador NO archiva el informe de un registro ajeno que solo puede leer');
await debePasar(U.supA, `insert into storage.objects (bucket_id, name) values ('informes', '${inf(A, '08_PETAR', 'PTR-S1')}')`,
  'Supervisor archiva el informe de su PETAR');
await debeFallar(U.adminB, `insert into storage.objects (bucket_id, name) values ('informes', '${inf(A, '08_PETAR', 'PTR-B1')}')`,
  'Admin B NO archiva informes en la carpeta de la empresa A');
await debePasar(U.supA, `update storage.objects set metadata = '{"v":2}' where bucket_id = 'informes' and name = '${inf(A, '08_PETAR', 'PTR-T1')}'`,
  'Quien edita el registro SÍ sustituye su informe (es lo que pasa en cada cambio)');
await debeFallar(U.trabA, `update storage.objects set metadata = '{"v":3}' where bucket_id = 'informes' and name = '${inf(A, '08_PETAR', 'PTR-S1')}'`,
  'Trabajador NO sustituye el informe de un registro ajeno');
r = await como(U.trabA, `select count(*)::int n from storage.objects where bucket_id = 'informes'`);
log(r.rows[0].n === 2, 'El informe lo ve quien ve el registro (Trabajador: ' + r.rows[0].n + ' de 2)');
r = await como(U.adminB, `select count(*)::int n from storage.objects where bucket_id = 'informes'`);
log(r.rows[0].n === 0, 'Admin B no ve ningún informe de la empresa A');
// Borrado: primero el registro, después su informe (que entonces es huérfano)
await debePasar(U.supA, `insert into storage.objects (bucket_id, name) values ('informes', '${inf(A, '07_IPERC', 'IPC-S1')}')`,
  'Supervisor archiva el informe de su IPERC');
await debeFallar(U.trabA, `delete from storage.objects where bucket_id = 'informes' and name = '${inf(A, '07_IPERC', 'IPC-S1')}'`,
  'Nadie borra el informe de un registro VIVO que no puede editar');
await debePasar(U.adminA, `delete from iperc where uuid = 'IPC-S1'`, 'Admin elimina el registro principal');
// Eliminar un registro es cosa del Admin en los diez módulos (canDelete), y es
// él quien retira después el informe huérfano: sin esto, borrar un registro
// dejaría para siempre su PDF con sello oficial en el servidor.
await debeFallar(U.trabA, `delete from storage.objects where bucket_id = 'informes' and name = '${inf(A, '07_IPERC', 'IPC-S1')}'`,
  'El informe de un registro eliminado no lo retira cualquiera');
await debePasar(U.adminA, `delete from storage.objects where bucket_id = 'informes' and name = '${inf(A, '07_IPERC', 'IPC-S1')}'`,
  'El Admin SÍ retira el informe huérfano (el registro ya no existe)');
await debeFallar(U.adminB, `delete from storage.objects where bucket_id = 'informes' and name = '${inf(A, '08_PETAR', 'PTR-S1')}'`,
  'Admin B NO borra informes de la empresa A');

console.log('\n── Plan, suspensión y visibilidad por rol (A6)');
const cuenta = async (u, t) => (await como(u, `select count(*)::int n from ${t}`)).rows[0].n;
const petarAdminA = await cuenta(U.adminA, 'petar');
const verifAdminA = await cuenta(U.adminA, 'petar_verificaciones');
log(petarAdminA > 0 && verifAdminA > 0, 'Plan vacío = todo contratado (Admin A ve ' + petarAdminA + ' PETAR)');

// El SuperAdmin quita PETAR del plan de A (otros módulos siguen)
await db.exec(`update empresas set modulos = '{"10_Charlas": true, "08_PETAR": false}' where id = '${A}'`);
log(await cuenta(U.adminA, 'petar') === 0, 'Módulo fuera del plan: el Admin no lee la tabla por la API');
log(await cuenta(U.adminA, 'petar_verificaciones') === 0, '…ni su tabla hija');
await debeFallar(U.adminA, `insert into petar (empresa_id, uuid) values ('${A}', 'PTR-SINPLAN')`, 'Módulo fuera del plan: el Admin NO inserta');
await debeFallar(U.adminA, `update petar set descripcion = 'x' where empresa_id = '${A}'`, 'Módulo fuera del plan: el Admin NO edita');
r = await como(U.trabA, `select count(*)::int n from storage.objects where name like '%/08_PETAR/%'`);
log(r.rows[0].n === 0, 'Módulo fuera del plan: tampoco se leen sus archivos');
log(await cuenta(U.adminA, 'charlas') > 0, 'Un módulo que sí está en el plan sigue funcionando');
log(await cuenta(U.super, 'petar') > 0, 'El SuperAdmin no depende del plan');
log(await cuenta(U.adminB, 'petar') > 0, 'El plan de A no afecta a la empresa B');
await db.exec(`update empresas set modulos = '{}' where id = '${A}'`);

// El Admin oculta Charlas a los Trabajadores (vía la RPC, como la app)
await debePasar(U.trabA, `insert into charlas (empresa_id, uuid, tema) values ('${A}', 'CHL-T1', 'Mía')`, 'Trabajador registra una charla (módulo visible)');
await debePasar(U.adminA, `select guardar_config_empresa('{"Modulos_Visibles": {"10_Charlas": {"trabajador": false}}}'::jsonb)`, 'Admin oculta Charlas a los Trabajadores');
log(await cuenta(U.trabA, 'charlas') === 0, 'Oculto para Trabajador: no lo lee por la API');
await debeFallar(U.trabA, `insert into charlas (empresa_id, uuid, tema) values ('${A}', 'CHL-T2', 'x')`, 'Oculto para Trabajador: NO inserta');
log(await cuenta(U.supA, 'charlas') > 0, 'El Supervisor lo sigue viendo (solo se ocultó al Trabajador)');
log(await cuenta(U.adminA, 'charlas') > 0, 'El Admin lo sigue viendo');
await debeFallar(U.trabA, `select guardar_config_empresa('{"Modulos_Visibles": {}}'::jsonb)`, 'Un Trabajador NO cambia la visibilidad');
await debePasar(U.adminA, `select guardar_config_empresa('{"Modulos_Visibles": {"10_Charlas": {"trabajador": "basura"}}}'::jsonb)`, 'Un valor no booleano en config…');
log(await cuenta(U.trabA, 'charlas') > 0, '…no rompe las consultas (se trata como visible)');
await debePasar(U.adminA, `select guardar_config_empresa('{"Modulos_Visibles": {}}'::jsonb)`, 'Admin vuelve a mostrar todo');
await debeFallar(U.adminA, `select guardar_config_empresa('[1,2]'::jsonb)`, 'Config que no es objeto: rechazada');
await debeFallar(U.adminA, `select guardar_config_empresa(jsonb_build_object('x', repeat(md5(random()::text), 4000)))`, 'Config de más de 64 KB: rechazada');

// Empresa suspendida por el SuperAdmin: su JWT vigente deja de servir
await db.exec(`update empresas set activa = false where id = '${A}'`);
log(await cuenta(U.adminA, 'charlas') === 0, 'Empresa suspendida: el Admin ya no lee datos aunque su JWT siga vigente');
await debeFallar(U.trabA, `insert into charlas (empresa_id, uuid, tema) values ('${A}', 'CHL-SUSP', 'x')`, 'Empresa suspendida: NO se escribe');
log(await cuenta(U.adminB, 'charlas') >= 0 && await cuenta(U.super, 'charlas') > 0, 'La suspensión no afecta al SuperAdmin');
await db.exec(`update empresas set activa = true where id = '${A}'`);
log(await cuenta(U.adminA, 'charlas') > 0, 'Reactivada: todo vuelve a funcionar');

console.log('\n── Login por DNI (A3)');
async function anon(dni, ip) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'cf-connecting-ip': ip })]);
    await tx.query('set local role anon');
    return (await tx.query(`select login_email_de_dni($1) e`, [dni])).rows[0].e;
  });
}
log(await anon(U.adminA.dni, '1.1.1.1') === 'adminA@x.com', 'Resuelve DNI → email');
log(await anon(U.cesado.dni, '1.1.1.1') === null, 'No responde para cuentas Cesadas');
let bloqueado = 0;
for (let i = 0; i < 25; i++) { try { await anon('0000000' + (i % 10), '6.6.6.6'); } catch (e) { bloqueado++; } }
log(bloqueado === 5, 'Barrido de 25 DNIs desde una IP: ' + bloqueado + ' bloqueadas (límite 20 / 10 min)');
log(await anon(U.adminA.dni, '7.7.7.7') === 'adminA@x.com', 'Otra IP no se ve afectada');
try { await db.query(`set role anon; select * from login_consultas;`); log(false, 'anon lee login_consultas — ¡PERMITIDO!'); }
catch (e) { log(true, 'anon NO lee la tabla de límites'); } finally { await db.exec('reset role'); }

// ── motor_agregado: conteos de KPI contados por la base (08) ─────────────
// Lo que sostiene la paginacion: la tabla muestra 50 filas, pero el KPI
// cuenta sobre TODAS. Si esta funcion no respetara el RLS, un trabajador
// veria en un numero lo que no puede ver en la lista.
console.log('\n── Agregados de KPI (08_rendimiento)');
const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
await db.exec(`insert into inspecciones (empresa_id, uuid, estado_actual, plazo, creado_por_dni, auditor_dni) values
  ('${A}', 'AGG-A1', 'Abierto',  '2020-01-01', '${U.trabA.dni}', '${U.supA.dni}'),
  ('${A}', 'AGG-A2', 'Abierto',  '2099-01-01', '${U.trabA.dni}', '${U.supA.dni}'),
  ('${A}', 'AGG-A3', 'Cerrado',  '2020-01-01', '${U.trabA.dni}', '${U.supA.dni}'),
  ('${A}', 'AGG-A4', 'Abierto',  null,         '${U.adminA.dni}', '${U.adminA.dni}'),
  ('${B}', 'AGG-B1', 'Abierto',  '2020-01-01', '${U.adminB.dni}', '${U.adminB.dni}');`);

const agg = async (u, metrica, columna, cond) => Number((await como(u,
  `select motor_agregado('inspecciones', $1, $2, $3::jsonb) n`,
  [metrica, columna, JSON.stringify(cond || {})])).rows[0].n);

log(await agg(U.adminA, 'count', null, {}) === 4,
    'El Admin cuenta las 4 filas de SU empresa, no las 5 de la base');
log(await agg(U.adminB, 'count', null, {}) === 1,
    'El Admin de B cuenta solo la suya (aislamiento entre empresas)');
log(await agg(U.adminA, 'count', null, { estado_actual: { neq: 'Cerrado' } }) === 3,
    'Cuenta con neq: 3 abiertas');
log(await agg(U.adminA, 'count', null, { estado_actual: { neq: 'Cerrado' }, plazo: { lt: HOY } }) === 1,
    'Vencidas = abiertas con plazo pasado: 1 (la fila SIN plazo no cuenta como vencida)');
log(await agg(U.adminA, 'count', null, { plazo: { nulo: true } }) === 1, 'Operador nulo');
log(await agg(U.adminA, 'count', null, { estado_actual: { in: ['Abierto', 'Cerrado'] } }) === 4, 'Operador in');
log(await agg(U.adminA, 'count', null, { estado_actual: { like: 'bier' } }) === 3, 'Operador like (parcial)');
log((await como(U.adminA, `select motor_agregado('inspecciones','max','plazo','{}'::jsonb) v`)).rows[0].v === '2099-01-01',
    'max() sobre una columna date devuelve la fecha, no un numero');

// El alcance del rol tambien se aplica al conteo: el Trabajador de 01 solo ve
// lo propio ('propios'), asi que su KPI es menor que el del Admin.
const nTrab = await agg(U.trabA, 'count', null, {});
const nFilasTrab = await cuenta(U.trabA, 'inspecciones');
log(nTrab === nFilasTrab,
    'El conteo del Trabajador coincide EXACTAMENTE con las filas que puede leer (' + nTrab + ')');
log(nTrab < 4, 'Y es menor que el del Admin: el alcance del rol se aplica al agregado');

// Alternativas ($o): "vencido" = plazo anterior a hoy O (plazo = hoy y ya cerrado).
// Es el caso de PETAR (fecha anterior O misma fecha con la hora pasada), que sin
// $o solo se podria aproximar.
log(await agg(U.adminA, 'count', null, { $o: [
      { plazo: { lt: '2021-01-01' } },
      { estado_actual: { eq: 'Abierto' }, plazo: { gt: '2098-01-01' } }
    ] }) === 3, '$o: alternativas (2 con plazo viejo + 1 abierta con plazo lejano)');
log(await agg(U.adminA, 'count', null, {
      estado_actual: { neq: 'Cerrado' },
      $o: [{ plazo: { lt: '2021-01-01' } }, { plazo: { nulo: true } }]
    }) === 2, '$o combinado con una condicion normal (se cumplen las dos cosas)');
await debeFallar(U.adminA, `select motor_agregado('inspecciones','count',null,'{"$o":{"a":1}}'::jsonb)`,
                 '$o que no es una lista: rechazado');

await debeFallar(U.adminA, `select motor_agregado('usuarios','count',null,'{}'::jsonb)`,
                 'Tabla fuera de la lista blanca: rechazada');
await debeFallar(U.adminA, `select motor_agregado('inspecciones','count',null,'{"no_existe":{"eq":"x"}}'::jsonb)`,
                 'Columna inexistente: rechazada');
await debeFallar(U.adminA, `select motor_agregado('inspecciones','count',null,'{"estado_actual":{"drop":"x"}}'::jsonb)`,
                 'Operador no permitido: rechazado');
await debeFallar(U.adminA, `select motor_agregado('inspecciones','sum','uuid; drop table inspecciones','{}'::jsonb)`,
                 'Nombre de columna con SQL dentro: rechazado');
await debeFallar(U.adminA, `select motor_agregado('inspecciones','median','plazo','{}'::jsonb)`,
                 'Metrica no permitida: rechazada');
// El valor va por %L, asi que una comilla es un dato, no una inyeccion
log(await agg(U.adminA, 'count', null, { estado_actual: { eq: "no' or 1=1 --" } }) === 0,
    'Una comilla en el valor es un dato, no SQL');

console.log(`\nRESULTADO: ${ok} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
