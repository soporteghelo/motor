-- =========================================================================
-- MOTOR PWA · Seguridad por fila (RLS)
--
-- Sin estas políticas, cualquier usuario con la clave anon puede leer
-- TODA la base. Con ellas, Postgres impide el acceso cruzado entre
-- empresas aunque el frontend tuviera un fallo.
-- =========================================================================

-- Rol y empresa se leen de los claims del JWT: no hay consulta extra por fila.
create or replace function auth_rol() returns text as $$
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
$$ language sql stable;

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
create policy usuarios_upd on usuarios for update using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
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
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
      ))
);
drop policy if exists reportes_ins on reportes;
create policy reportes_ins on reportes for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists reportes_upd on reportes;
create policy reportes_upd on reportes for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni()))
      ))
);
drop policy if exists reportes_del on reportes;
create policy reportes_del on reportes for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table reportes_child enable row level security;
drop policy if exists reportes_child_all on reportes_child;
create policy reportes_child_all on reportes_child for all using (
  exists (select 1 from reportes p where p.uuid = reportes_child.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── inspecciones ────────────────────────────────────────────────
alter table inspecciones enable row level security;
drop policy if exists inspecciones_sel on inspecciones;
create policy inspecciones_sel on inspecciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (auditor_dni = auth_dni())
      ))
);
drop policy if exists inspecciones_ins on inspecciones;
create policy inspecciones_ins on inspecciones for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists inspecciones_upd on inspecciones;
create policy inspecciones_upd on inspecciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (auditor_dni = auth_dni())))
      ))
);
drop policy if exists inspecciones_del on inspecciones;
create policy inspecciones_del on inspecciones for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table inspecciones_child enable row level security;
drop policy if exists inspecciones_child_all on inspecciones_child;
create policy inspecciones_child_all on inspecciones_child for all using (
  exists (select 1 from inspecciones p where p.uuid = inspecciones_child.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── actos_condiciones ───────────────────────────────────────────
alter table actos_condiciones enable row level security;
drop policy if exists actos_condiciones_sel on actos_condiciones;
create policy actos_condiciones_sel on actos_condiciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (moderado_por = auth_dni() or reportado_por = auth_dni())
      ))
);
drop policy if exists actos_condiciones_ins on actos_condiciones;
create policy actos_condiciones_ins on actos_condiciones for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists actos_condiciones_upd on actos_condiciones;
create policy actos_condiciones_upd on actos_condiciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (moderado_por = auth_dni() or reportado_por = auth_dni())))
      ))
);
drop policy if exists actos_condiciones_del on actos_condiciones;
create policy actos_condiciones_del on actos_condiciones for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- ── incidentes ──────────────────────────────────────────────────
alter table incidentes enable row level security;
drop policy if exists incidentes_sel on incidentes;
create policy incidentes_sel on incidentes for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (trabajador_dni = auth_dni() or reportado_por = auth_dni())
      ))
);
drop policy if exists incidentes_ins on incidentes;
create policy incidentes_ins on incidentes for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists incidentes_upd on incidentes;
create policy incidentes_upd on incidentes for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (trabajador_dni = auth_dni() or reportado_por = auth_dni())))
      ))
);
drop policy if exists incidentes_del on incidentes;
create policy incidentes_del on incidentes for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table incidentes_acciones enable row level security;
drop policy if exists incidentes_acciones_all on incidentes_acciones;
create policy incidentes_acciones_all on incidentes_acciones for all using (
  exists (select 1 from incidentes p where p.uuid = incidentes_acciones.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── capacitaciones ──────────────────────────────────────────────
alter table capacitaciones enable row level security;
drop policy if exists capacitaciones_sel on capacitaciones;
create policy capacitaciones_sel on capacitaciones for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
      ))
);
drop policy if exists capacitaciones_ins on capacitaciones;
create policy capacitaciones_ins on capacitaciones for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists capacitaciones_upd on capacitaciones;
create policy capacitaciones_upd on capacitaciones for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni()))
      ))
);
drop policy if exists capacitaciones_del on capacitaciones;
create policy capacitaciones_del on capacitaciones for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table capacitaciones_asistentes enable row level security;
drop policy if exists capacitaciones_asistentes_all on capacitaciones_asistentes;
create policy capacitaciones_asistentes_all on capacitaciones_asistentes for all using (
  exists (select 1 from capacitaciones p where p.uuid = capacitaciones_asistentes.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── iperc ───────────────────────────────────────────────────────
alter table iperc enable row level security;
drop policy if exists iperc_sel on iperc;
create policy iperc_sel on iperc for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (revisado_por = auth_dni() or elaborado_por = auth_dni())
      ))
);
drop policy if exists iperc_ins on iperc;
create policy iperc_ins on iperc for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists iperc_upd on iperc;
create policy iperc_upd on iperc for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (revisado_por = auth_dni() or elaborado_por = auth_dni())))
      ))
);
drop policy if exists iperc_del on iperc;
create policy iperc_del on iperc for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table iperc_peligros enable row level security;
drop policy if exists iperc_peligros_all on iperc_peligros;
create policy iperc_peligros_all on iperc_peligros for all using (
  exists (select 1 from iperc p where p.uuid = iperc_peligros.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── petar ───────────────────────────────────────────────────────
alter table petar enable row level security;
drop policy if exists petar_sel on petar;
create policy petar_sel on petar for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (supervisor_dni = auth_dni() or aprobado_por = auth_dni() or ejecutante_dni = auth_dni())
      ))
);
drop policy if exists petar_ins on petar;
create policy petar_ins on petar for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists petar_upd on petar;
create policy petar_upd on petar for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (supervisor_dni = auth_dni() or aprobado_por = auth_dni() or ejecutante_dni = auth_dni())))
      ))
);
drop policy if exists petar_del on petar;
create policy petar_del on petar for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table petar_verificaciones enable row level security;
drop policy if exists petar_verificaciones_all on petar_verificaciones;
create policy petar_verificaciones_all on petar_verificaciones for all using (
  exists (select 1 from petar p where p.uuid = petar_verificaciones.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── epp ─────────────────────────────────────────────────────────
alter table epp enable row level security;
drop policy if exists epp_sel on epp;
create policy epp_sel on epp for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (entregado_por = auth_dni() or trabajador_dni = auth_dni())
      ))
);
drop policy if exists epp_ins on epp;
create policy epp_ins on epp for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists epp_upd on epp;
create policy epp_upd on epp for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (entregado_por = auth_dni() or trabajador_dni = auth_dni())))
      ))
);
drop policy if exists epp_del on epp;
create policy epp_del on epp for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table epp_items enable row level security;
drop policy if exists epp_items_all on epp_items;
create policy epp_items_all on epp_items for all using (
  exists (select 1 from epp p where p.uuid = epp_items.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);

-- ── charlas ─────────────────────────────────────────────────────
alter table charlas enable row level security;
drop policy if exists charlas_sel on charlas;
create policy charlas_sel on charlas for select using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or creado_por_dni = auth_dni()
       or (expositor_dni = auth_dni())
      ))
);
drop policy if exists charlas_ins on charlas;
create policy charlas_ins on charlas for insert with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
drop policy if exists charlas_upd on charlas;
create policy charlas_upd on charlas for update using (
      auth_rol() = 'superadmin'
   or (empresa_id = auth_empresa() and (
          auth_rol() = 'admin'
       or (auth_rol() = 'supervisor' and (creado_por_dni = auth_dni() or (expositor_dni = auth_dni())))
      ))
);
drop policy if exists charlas_del on charlas;
create policy charlas_del on charlas for delete using (
  auth_rol() = 'superadmin' or (auth_rol() = 'admin' and empresa_id = auth_empresa())
);

-- La tabla hija hereda el acceso del padre: si no puedes ver el
-- registro principal, tampoco su detalle.
alter table charlas_asistentes enable row level security;
drop policy if exists charlas_asistentes_all on charlas_asistentes;
create policy charlas_asistentes_all on charlas_asistentes for all using (
  exists (select 1 from charlas p where p.uuid = charlas_asistentes.parent_uuid)
) with check (
  empresa_id = auth_empresa() or auth_rol() = 'superadmin'
);
