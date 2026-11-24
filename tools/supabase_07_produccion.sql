-- =========================================================================
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
  foreach t in array array['reportes', 'inspecciones', 'actos_condiciones', 'incidentes', 'capacitaciones', 'iperc', 'petar', 'epp', 'charlas', 'webs'] loop
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
      ('reportes_child', 'reportes'),
      ('inspecciones_child', 'inspecciones'),
      ('incidentes_acciones', 'incidentes'),
      ('capacitaciones_asistentes', 'capacitaciones'),
      ('iperc_peligros', 'iperc'),
      ('petar_verificaciones', 'petar'),
      ('epp_items', 'epp'),
      ('charlas_asistentes', 'charlas')
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
  if p_tabla is null or p_tabla not in ('reportes_child', 'inspecciones_child', 'incidentes_acciones', 'capacitaciones_asistentes', 'iperc_peligros', 'petar_verificaciones', 'epp_items', 'charlas_asistentes') then
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
