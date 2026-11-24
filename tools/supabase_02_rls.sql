-- =========================================================================
-- MOTOR PWA · Seguridad por fila (RLS)
--
-- Sin estas políticas, cualquier usuario con la clave anon puede leer
-- TODA la base. Con ellas, Postgres impide el acceso cruzado entre
-- empresas aunque el frontend tuviera un fallo.
-- =========================================================================

-- Rol y empresa se leen de los claims del JWT: no hay consulta extra por fila.
-- nullif(...,''): fuera de PostgREST (editor SQL, cron) el setting llega vacío
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
grant execute on function modulo_habilitado(text) to authenticated;

-- ── empresas ──────────────────────────────────────────────────────────
alter table empresas enable row level security;
drop policy if exists empresas_sel on empresas;
create policy empresas_sel on empresas for select using (
  auth_rol() = 'superadmin' or id = auth_empresa()
);
drop policy if exists empresas_mod on empresas;
create policy empresas_mod on empresas for all using (auth_rol() = 'superadmin')
                                        with check (auth_rol() = 'superadmin');

-- ── usuarios ──────────────────────────────────────────────────────────
-- El admin gestiona el personal de SU empresa; el resto solo se ve a sí mismo.
alter table usuarios enable row level security;
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
);

-- ── plantillas ────────────────────────────────────────────────────────
alter table plantillas enable row level security;
drop policy if exists plantillas_sel on plantillas;
create policy plantillas_sel on plantillas for select using (
  auth_rol() = 'superadmin' or empresa_id = auth_empresa()
);
drop policy if exists plantillas_mod on plantillas;
create policy plantillas_mod on plantillas for all using (
  auth_rol() in ('superadmin','admin') and (auth_rol() = 'superadmin' or empresa_id = auth_empresa())
) with check (
  auth_rol() in ('superadmin','admin') and (auth_rol() = 'superadmin' or empresa_id = auth_empresa())
);

-- ── reportes ────────────────────────────────────────────────────
alter table reportes enable row level security;
drop policy if exists reportes_sel on reportes;
create policy reportes_sel on reportes for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('02_Reportes')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()))
      ))
);
drop policy if exists reportes_ins on reportes;
create policy reportes_ins on reportes for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('02_Reportes')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists reportes_upd on reportes;
create policy reportes_upd on reportes for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('02_Reportes')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and creado_por_dni = auth_dni())))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('02_Reportes')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and creado_por_dni = auth_dni())))
);
drop policy if exists reportes_del on reportes;
create policy reportes_del on reportes for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('02_Reportes')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table reportes_child enable row level security;
drop policy if exists reportes_child_all on reportes_child;
drop policy if exists reportes_child_sel on reportes_child;
create policy reportes_child_sel on reportes_child for select using (
  exists (select 1 from reportes p where p.uuid = reportes_child.parent_uuid and p.empresa_id = reportes_child.empresa_id)
);
drop policy if exists reportes_child_ins on reportes_child;
create policy reportes_child_ins on reportes_child for insert with check (
  exists (
    select 1 from reportes p
     where p.uuid = reportes_child.parent_uuid
       and p.empresa_id = reportes_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists reportes_child_upd on reportes_child;
create policy reportes_child_upd on reportes_child for update using (
  exists (
    select 1 from reportes p
     where p.uuid = reportes_child.parent_uuid
       and p.empresa_id = reportes_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from reportes p
     where p.uuid = reportes_child.parent_uuid
       and p.empresa_id = reportes_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists reportes_child_del on reportes_child;
create policy reportes_child_del on reportes_child for delete using (
  exists (
    select 1 from reportes p
     where p.uuid = reportes_child.parent_uuid
       and p.empresa_id = reportes_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── inspecciones ────────────────────────────────────────────────
alter table inspecciones enable row level security;
drop policy if exists inspecciones_sel on inspecciones;
create policy inspecciones_sel on inspecciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('03_Inspecciones')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or auditor_dni = auth_dni()))
      ))
);
drop policy if exists inspecciones_ins on inspecciones;
create policy inspecciones_ins on inspecciones for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('03_Inspecciones')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists inspecciones_upd on inspecciones;
create policy inspecciones_upd on inspecciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('03_Inspecciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or auditor_dni = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('03_Inspecciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or auditor_dni = auth_dni()))))
);
drop policy if exists inspecciones_del on inspecciones;
create policy inspecciones_del on inspecciones for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('03_Inspecciones')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table inspecciones_child enable row level security;
drop policy if exists inspecciones_child_all on inspecciones_child;
drop policy if exists inspecciones_child_sel on inspecciones_child;
create policy inspecciones_child_sel on inspecciones_child for select using (
  exists (select 1 from inspecciones p where p.uuid = inspecciones_child.parent_uuid and p.empresa_id = inspecciones_child.empresa_id)
);
drop policy if exists inspecciones_child_ins on inspecciones_child;
create policy inspecciones_child_ins on inspecciones_child for insert with check (
  exists (
    select 1 from inspecciones p
     where p.uuid = inspecciones_child.parent_uuid
       and p.empresa_id = inspecciones_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.auditor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists inspecciones_child_upd on inspecciones_child;
create policy inspecciones_child_upd on inspecciones_child for update using (
  exists (
    select 1 from inspecciones p
     where p.uuid = inspecciones_child.parent_uuid
       and p.empresa_id = inspecciones_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.auditor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from inspecciones p
     where p.uuid = inspecciones_child.parent_uuid
       and p.empresa_id = inspecciones_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.auditor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists inspecciones_child_del on inspecciones_child;
create policy inspecciones_child_del on inspecciones_child for delete using (
  exists (
    select 1 from inspecciones p
     where p.uuid = inspecciones_child.parent_uuid
       and p.empresa_id = inspecciones_child.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.auditor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── actos_condiciones ───────────────────────────────────────────
alter table actos_condiciones enable row level security;
drop policy if exists actos_condiciones_sel on actos_condiciones;
create policy actos_condiciones_sel on actos_condiciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('04_Actos_Condiciones')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or moderado_por = auth_dni()
         or reportado_por = auth_dni()))
      ))
);
drop policy if exists actos_condiciones_ins on actos_condiciones;
create policy actos_condiciones_ins on actos_condiciones for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('04_Actos_Condiciones')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists actos_condiciones_upd on actos_condiciones;
create policy actos_condiciones_upd on actos_condiciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('04_Actos_Condiciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or moderado_por = auth_dni() or reportado_por = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('04_Actos_Condiciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or moderado_por = auth_dni() or reportado_por = auth_dni()))))
);
drop policy if exists actos_condiciones_del on actos_condiciones;
create policy actos_condiciones_del on actos_condiciones for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('04_Actos_Condiciones')) and (auth_rol() = 'admin'))
);

-- ── incidentes ──────────────────────────────────────────────────
alter table incidentes enable row level security;
drop policy if exists incidentes_sel on incidentes;
create policy incidentes_sel on incidentes for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('05_Incidentes')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or trabajador_dni = auth_dni()
         or reportado_por = auth_dni()))
      ))
);
drop policy if exists incidentes_ins on incidentes;
create policy incidentes_ins on incidentes for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('05_Incidentes')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists incidentes_upd on incidentes;
create policy incidentes_upd on incidentes for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('05_Incidentes')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or trabajador_dni = auth_dni() or reportado_por = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('05_Incidentes')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or trabajador_dni = auth_dni() or reportado_por = auth_dni()))))
);
drop policy if exists incidentes_del on incidentes;
create policy incidentes_del on incidentes for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('05_Incidentes')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table incidentes_acciones enable row level security;
drop policy if exists incidentes_acciones_all on incidentes_acciones;
drop policy if exists incidentes_acciones_sel on incidentes_acciones;
create policy incidentes_acciones_sel on incidentes_acciones for select using (
  exists (select 1 from incidentes p where p.uuid = incidentes_acciones.parent_uuid and p.empresa_id = incidentes_acciones.empresa_id)
);
drop policy if exists incidentes_acciones_ins on incidentes_acciones;
create policy incidentes_acciones_ins on incidentes_acciones for insert with check (
  exists (
    select 1 from incidentes p
     where p.uuid = incidentes_acciones.parent_uuid
       and p.empresa_id = incidentes_acciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.trabajador_dni = auth_dni() or p.reportado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists incidentes_acciones_upd on incidentes_acciones;
create policy incidentes_acciones_upd on incidentes_acciones for update using (
  exists (
    select 1 from incidentes p
     where p.uuid = incidentes_acciones.parent_uuid
       and p.empresa_id = incidentes_acciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.trabajador_dni = auth_dni() or p.reportado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from incidentes p
     where p.uuid = incidentes_acciones.parent_uuid
       and p.empresa_id = incidentes_acciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.trabajador_dni = auth_dni() or p.reportado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists incidentes_acciones_del on incidentes_acciones;
create policy incidentes_acciones_del on incidentes_acciones for delete using (
  exists (
    select 1 from incidentes p
     where p.uuid = incidentes_acciones.parent_uuid
       and p.empresa_id = incidentes_acciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.trabajador_dni = auth_dni() or p.reportado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── capacitaciones ──────────────────────────────────────────────
alter table capacitaciones enable row level security;
drop policy if exists capacitaciones_sel on capacitaciones;
create policy capacitaciones_sel on capacitaciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('06_Capacitaciones')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()))
      ))
);
drop policy if exists capacitaciones_ins on capacitaciones;
create policy capacitaciones_ins on capacitaciones for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('06_Capacitaciones')) and auth_rol() in ('admin', 'supervisor'))
);
drop policy if exists capacitaciones_upd on capacitaciones;
create policy capacitaciones_upd on capacitaciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('06_Capacitaciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and creado_por_dni = auth_dni())))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('06_Capacitaciones')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and creado_por_dni = auth_dni())))
);
drop policy if exists capacitaciones_del on capacitaciones;
create policy capacitaciones_del on capacitaciones for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('06_Capacitaciones')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table capacitaciones_asistentes enable row level security;
drop policy if exists capacitaciones_asistentes_all on capacitaciones_asistentes;
drop policy if exists capacitaciones_asistentes_sel on capacitaciones_asistentes;
create policy capacitaciones_asistentes_sel on capacitaciones_asistentes for select using (
  exists (select 1 from capacitaciones p where p.uuid = capacitaciones_asistentes.parent_uuid and p.empresa_id = capacitaciones_asistentes.empresa_id)
);
drop policy if exists capacitaciones_asistentes_ins on capacitaciones_asistentes;
create policy capacitaciones_asistentes_ins on capacitaciones_asistentes for insert with check (
  exists (
    select 1 from capacitaciones p
     where p.uuid = capacitaciones_asistentes.parent_uuid
       and p.empresa_id = capacitaciones_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists capacitaciones_asistentes_upd on capacitaciones_asistentes;
create policy capacitaciones_asistentes_upd on capacitaciones_asistentes for update using (
  exists (
    select 1 from capacitaciones p
     where p.uuid = capacitaciones_asistentes.parent_uuid
       and p.empresa_id = capacitaciones_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from capacitaciones p
     where p.uuid = capacitaciones_asistentes.parent_uuid
       and p.empresa_id = capacitaciones_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists capacitaciones_asistentes_del on capacitaciones_asistentes;
create policy capacitaciones_asistentes_del on capacitaciones_asistentes for delete using (
  exists (
    select 1 from capacitaciones p
     where p.uuid = capacitaciones_asistentes.parent_uuid
       and p.empresa_id = capacitaciones_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and p.creado_por_dni = auth_dni())
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── iperc ───────────────────────────────────────────────────────
alter table iperc enable row level security;
drop policy if exists iperc_sel on iperc;
create policy iperc_sel on iperc for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('07_IPERC')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or revisado_por = auth_dni()
         or elaborado_por = auth_dni()))
      ))
);
drop policy if exists iperc_ins on iperc;
create policy iperc_ins on iperc for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('07_IPERC')) and auth_rol() in ('admin', 'supervisor'))
);
drop policy if exists iperc_upd on iperc;
create policy iperc_upd on iperc for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('07_IPERC')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or revisado_por = auth_dni() or elaborado_por = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('07_IPERC')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or revisado_por = auth_dni() or elaborado_por = auth_dni()))))
);
drop policy if exists iperc_del on iperc;
create policy iperc_del on iperc for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('07_IPERC')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table iperc_peligros enable row level security;
drop policy if exists iperc_peligros_all on iperc_peligros;
drop policy if exists iperc_peligros_sel on iperc_peligros;
create policy iperc_peligros_sel on iperc_peligros for select using (
  exists (select 1 from iperc p where p.uuid = iperc_peligros.parent_uuid and p.empresa_id = iperc_peligros.empresa_id)
);
drop policy if exists iperc_peligros_ins on iperc_peligros;
create policy iperc_peligros_ins on iperc_peligros for insert with check (
  exists (
    select 1 from iperc p
     where p.uuid = iperc_peligros.parent_uuid
       and p.empresa_id = iperc_peligros.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.revisado_por = auth_dni() or p.elaborado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists iperc_peligros_upd on iperc_peligros;
create policy iperc_peligros_upd on iperc_peligros for update using (
  exists (
    select 1 from iperc p
     where p.uuid = iperc_peligros.parent_uuid
       and p.empresa_id = iperc_peligros.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.revisado_por = auth_dni() or p.elaborado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from iperc p
     where p.uuid = iperc_peligros.parent_uuid
       and p.empresa_id = iperc_peligros.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.revisado_por = auth_dni() or p.elaborado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists iperc_peligros_del on iperc_peligros;
create policy iperc_peligros_del on iperc_peligros for delete using (
  exists (
    select 1 from iperc p
     where p.uuid = iperc_peligros.parent_uuid
       and p.empresa_id = iperc_peligros.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.revisado_por = auth_dni() or p.elaborado_por = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── petar ───────────────────────────────────────────────────────
alter table petar enable row level security;
drop policy if exists petar_sel on petar;
create policy petar_sel on petar for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('08_PETAR')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or supervisor_dni = auth_dni()
         or aprobado_por = auth_dni()
         or ejecutante_dni = auth_dni()))
      ))
);
drop policy if exists petar_ins on petar;
create policy petar_ins on petar for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('08_PETAR')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists petar_upd on petar;
create policy petar_upd on petar for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('08_PETAR')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or supervisor_dni = auth_dni() or aprobado_por = auth_dni() or ejecutante_dni = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('08_PETAR')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or supervisor_dni = auth_dni() or aprobado_por = auth_dni() or ejecutante_dni = auth_dni()))))
);
drop policy if exists petar_del on petar;
create policy petar_del on petar for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('08_PETAR')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table petar_verificaciones enable row level security;
drop policy if exists petar_verificaciones_all on petar_verificaciones;
drop policy if exists petar_verificaciones_sel on petar_verificaciones;
create policy petar_verificaciones_sel on petar_verificaciones for select using (
  exists (select 1 from petar p where p.uuid = petar_verificaciones.parent_uuid and p.empresa_id = petar_verificaciones.empresa_id)
);
drop policy if exists petar_verificaciones_ins on petar_verificaciones;
create policy petar_verificaciones_ins on petar_verificaciones for insert with check (
  exists (
    select 1 from petar p
     where p.uuid = petar_verificaciones.parent_uuid
       and p.empresa_id = petar_verificaciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.supervisor_dni = auth_dni() or p.aprobado_por = auth_dni() or p.ejecutante_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists petar_verificaciones_upd on petar_verificaciones;
create policy petar_verificaciones_upd on petar_verificaciones for update using (
  exists (
    select 1 from petar p
     where p.uuid = petar_verificaciones.parent_uuid
       and p.empresa_id = petar_verificaciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.supervisor_dni = auth_dni() or p.aprobado_por = auth_dni() or p.ejecutante_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from petar p
     where p.uuid = petar_verificaciones.parent_uuid
       and p.empresa_id = petar_verificaciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.supervisor_dni = auth_dni() or p.aprobado_por = auth_dni() or p.ejecutante_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists petar_verificaciones_del on petar_verificaciones;
create policy petar_verificaciones_del on petar_verificaciones for delete using (
  exists (
    select 1 from petar p
     where p.uuid = petar_verificaciones.parent_uuid
       and p.empresa_id = petar_verificaciones.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.supervisor_dni = auth_dni() or p.aprobado_por = auth_dni() or p.ejecutante_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── epp ─────────────────────────────────────────────────────────
alter table epp enable row level security;
drop policy if exists epp_sel on epp;
create policy epp_sel on epp for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('09_EPP')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or entregado_por = auth_dni()
         or trabajador_dni = auth_dni()))
      ))
);
drop policy if exists epp_ins on epp;
create policy epp_ins on epp for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('09_EPP')) and auth_rol() in ('admin', 'supervisor'))
);
drop policy if exists epp_upd on epp;
create policy epp_upd on epp for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('09_EPP')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or entregado_por = auth_dni() or trabajador_dni = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('09_EPP')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or entregado_por = auth_dni() or trabajador_dni = auth_dni()))))
);
drop policy if exists epp_del on epp;
create policy epp_del on epp for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('09_EPP')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table epp_items enable row level security;
drop policy if exists epp_items_all on epp_items;
drop policy if exists epp_items_sel on epp_items;
create policy epp_items_sel on epp_items for select using (
  exists (select 1 from epp p where p.uuid = epp_items.parent_uuid and p.empresa_id = epp_items.empresa_id)
);
drop policy if exists epp_items_ins on epp_items;
create policy epp_items_ins on epp_items for insert with check (
  exists (
    select 1 from epp p
     where p.uuid = epp_items.parent_uuid
       and p.empresa_id = epp_items.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.entregado_por = auth_dni() or p.trabajador_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists epp_items_upd on epp_items;
create policy epp_items_upd on epp_items for update using (
  exists (
    select 1 from epp p
     where p.uuid = epp_items.parent_uuid
       and p.empresa_id = epp_items.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.entregado_por = auth_dni() or p.trabajador_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from epp p
     where p.uuid = epp_items.parent_uuid
       and p.empresa_id = epp_items.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.entregado_por = auth_dni() or p.trabajador_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists epp_items_del on epp_items;
create policy epp_items_del on epp_items for delete using (
  exists (
    select 1 from epp p
     where p.uuid = epp_items.parent_uuid
       and p.empresa_id = epp_items.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.entregado_por = auth_dni() or p.trabajador_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── charlas ─────────────────────────────────────────────────────
alter table charlas enable row level security;
drop policy if exists charlas_sel on charlas;
create policy charlas_sel on charlas for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('10_Charlas')) and (
          auth_rol() in ('admin')
       or (auth_rol() in ('supervisor', 'trabajador') and (
            creado_por_dni = auth_dni()
         or expositor_dni = auth_dni()))
      ))
);
drop policy if exists charlas_ins on charlas;
create policy charlas_ins on charlas for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('10_Charlas')) and auth_rol() in ('admin', 'supervisor', 'trabajador'))
);
drop policy if exists charlas_upd on charlas;
create policy charlas_upd on charlas for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('10_Charlas')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or expositor_dni = auth_dni()))))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('10_Charlas')) and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or expositor_dni = auth_dni()))))
);
drop policy if exists charlas_del on charlas;
create policy charlas_del on charlas for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('10_Charlas')) and (auth_rol() = 'admin'))
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle; y solo escribe en él quien
-- puede editar el registro principal.
alter table charlas_asistentes enable row level security;
drop policy if exists charlas_asistentes_all on charlas_asistentes;
drop policy if exists charlas_asistentes_sel on charlas_asistentes;
create policy charlas_asistentes_sel on charlas_asistentes for select using (
  exists (select 1 from charlas p where p.uuid = charlas_asistentes.parent_uuid and p.empresa_id = charlas_asistentes.empresa_id)
);
drop policy if exists charlas_asistentes_ins on charlas_asistentes;
create policy charlas_asistentes_ins on charlas_asistentes for insert with check (
  exists (
    select 1 from charlas p
     where p.uuid = charlas_asistentes.parent_uuid
       and p.empresa_id = charlas_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.expositor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists charlas_asistentes_upd on charlas_asistentes;
create policy charlas_asistentes_upd on charlas_asistentes for update using (
  exists (
    select 1 from charlas p
     where p.uuid = charlas_asistentes.parent_uuid
       and p.empresa_id = charlas_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.expositor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
) with check (
  exists (
    select 1 from charlas p
     where p.uuid = charlas_asistentes.parent_uuid
       and p.empresa_id = charlas_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.expositor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);
drop policy if exists charlas_asistentes_del on charlas_asistentes;
create policy charlas_asistentes_del on charlas_asistentes for delete using (
  exists (
    select 1 from charlas p
     where p.uuid = charlas_asistentes.parent_uuid
       and p.empresa_id = charlas_asistentes.empresa_id
       and (auth_rol() = 'superadmin'
            or (p.empresa_id = auth_empresa() and (
                   auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (p.creado_por_dni = auth_dni() or p.expositor_dni = auth_dni()))
                or (p.creado_por_dni = auth_dni() and p.creado_en > now() - interval '24 hours')
               )))
  )
);

-- ── webs ────────────────────────────────────────────────────────
alter table webs enable row level security;
drop policy if exists webs_sel on webs;
create policy webs_sel on webs for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('11_Webs')) and (
          auth_rol() in ('admin', 'supervisor', 'trabajador')
      ))
);
drop policy if exists webs_ins on webs;
create policy webs_ins on webs for insert with check (
  auth_rol() = 'superadmin' or (empresa_id = auth_empresa() and (select modulo_habilitado('11_Webs')) and auth_rol() in ('admin'))
);
drop policy if exists webs_upd on webs;
create policy webs_upd on webs for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('11_Webs')) and (auth_rol() = 'admin'))
) with check (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('11_Webs')) and (auth_rol() = 'admin'))
);
drop policy if exists webs_del on webs;
create policy webs_del on webs for delete using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (select modulo_habilitado('11_Webs')) and (auth_rol() = 'admin'))
);
