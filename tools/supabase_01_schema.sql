-- =========================================================================
-- MOTOR PWA · Esquema multi-empresa
-- Generado por tools/gen_supabase.js — no editar a mano
-- =========================================================================

create extension if not exists "pgcrypto";

-- ── Empresas (cada cliente del SaaS es una fila) ──────────────────────
create table if not exists empresas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  ruc            text,
  plan           text not null default 'trial',      -- trial | basico | pro
  modulos        jsonb not null default '{}'::jsonb, -- { "07_IPERC": true, ... }
  activa         boolean not null default true,
  trial_hasta    date,
  config         jsonb not null default '{}'::jsonb, -- ajustes de la app que edita el Admin
  creada_en      timestamptz not null default now()
);

-- ── Usuarios (enlazados a Supabase Auth) ──────────────────────────────
create table if not exists usuarios (
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
create index if not exists idx_usuarios_dni     on usuarios(dni);

-- ── Plantillas PDF por módulo y empresa ───────────────────────────────
create table if not exists plantillas (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  modulo         text not null,
  doc_id         text,
  actualizado    timestamptz default now(),
  autor          text,
  primary key (empresa_id, modulo)
);

-- ── 02_Reportes ───────────────────────────────────────────────────
create table if not exists reportes (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  fecha_emision  date,
  inspector_dni  text,
  categoria_reporte text,
  nivel_severidad text,
  evidencia_fotografica text,
  evidencia_fotografica_id text,
  evidencia_fotografica_path text,
  firma_operario text,
  firma_operario_id text,
  firma_operario_path text,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_reportes_empresa on reportes(empresa_id);
create index if not exists idx_reportes_creador on reportes(creado_por_dni);

create table if not exists reportes_child (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references reportes(uuid) on delete cascade,
  observacion    text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_reportes_child_padre on reportes_child(parent_uuid);

-- ── 03_Inspecciones ───────────────────────────────────────────────
create table if not exists inspecciones (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  fecha_peru     date,
  auditor_dni    text,
  area_inspeccion text,
  tipo_hallazgo  text,
  descripcion_tecnica text,
  estado_actual  text,
  responsable    text,
  plazo          date,
  evidencia_fotos text,
  evidencia_fotos_id text,
  evidencia_fotos_path text,
  firma_digital  text,
  firma_digital_id text,
  firma_digital_path text,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_inspecciones_empresa on inspecciones(empresa_id);
create index if not exists idx_inspecciones_creador on inspecciones(creado_por_dni);

create table if not exists inspecciones_child (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references inspecciones(uuid) on delete cascade,
  hallazgo       text,
  riesgo         text,
  recomendacion  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_inspecciones_child_padre on inspecciones_child(parent_uuid);

-- ── 04_Actos_Condiciones ──────────────────────────────────────────
create table if not exists actos_condiciones (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  fecha_reporte  date,
  fecha_incidente date,
  reportado_por  text,
  nombre_reportante text,
  area           text,
  tipo_reporte   text,
  categoria      text,
  nivel_riesgo   text,
  descripcion    text,
  evidencia_foto text,
  evidencia_foto_id text,
  evidencia_foto_path text,
  estado         text,
  moderado_por   text,
  fecha_moderacion date,
  accion_correctiva text,
  observaciones_mod text,
  fuente         text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_actos_condiciones_empresa on actos_condiciones(empresa_id);
create index if not exists idx_actos_condiciones_creador on actos_condiciones(creado_por_dni);

-- ── 05_Incidentes ─────────────────────────────────────────────────
create table if not exists incidentes (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  fecha_evento   date,
  hora_evento    text,
  tipo_evento    text,
  gravedad       text,
  severidad_potencial text,
  area           text,
  lugar_exacto   text,
  descripcion    text,
  trabajador_dni text,
  nombre_trabajador text,
  puesto         text,
  parte_afectada text,
  dias_descanso  text,
  testigos       text,
  tipo_personal  text,
  acciones_inmediatas text,
  equipo_involucrado text,
  costo_estimado_danos text,
  requiere_notificacion_autoridad text,
  notificados    text,
  causa_inmediata text,
  causa_basica   text,
  categoria_causa text,
  estado         text,
  investigador_dni text,
  fecha_cierre   date,
  evidencia_fotos text,
  evidencia_fotos_id text,
  evidencia_fotos_path text,
  firma_investigador text,
  firma_investigador_id text,
  firma_investigador_path text,
  reportado_por  text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_incidentes_empresa on incidentes(empresa_id);
create index if not exists idx_incidentes_creador on incidentes(creado_por_dni);

create table if not exists incidentes_acciones (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references incidentes(uuid) on delete cascade,
  accion         text,
  responsable    text,
  fecha_limite   date,
  estado_accion  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_incidentes_acciones_padre on incidentes_acciones(parent_uuid);

-- ── 06_Capacitaciones ─────────────────────────────────────────────
create table if not exists capacitaciones (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  nombre_capacitacion text,
  tipo           text,
  tema           text,
  modalidad      text,
  fecha_ejecucion date,
  duracion_horas text,
  instructor     text,
  entidad        text,
  lugar          text,
  vigencia_meses text,
  fecha_vencimiento date,
  evaluacion     text,
  nota_minima    text,
  estado         text,
  observaciones  text,
  registro_firmas text,
  registro_firmas_id text,
  registro_firmas_path text,
  material       text,
  material_id    text,
  material_path  text,
  registrado_por text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_capacitaciones_empresa on capacitaciones(empresa_id);
create index if not exists idx_capacitaciones_creador on capacitaciones(creado_por_dni);

create table if not exists capacitaciones_asistentes (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references capacitaciones(uuid) on delete cascade,
  dni            text,
  nombre         text,
  area_asis      text,
  nota           numeric,
  resultado      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_capacitaciones_asistentes_padre on capacitaciones_asistentes(parent_uuid);

-- ── 07_IPERC ──────────────────────────────────────────────────────
create table if not exists iperc (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  proceso        text,
  tipo_iperc     text,
  area           text,
  puesto_tarea   text,
  fecha_elaboracion date,
  fecha_revision date,
  elaborado_por  text,
  revisado_por   text,
  participantes  text,
  estado         text,
  riesgo_maximo  text,
  total_peligros text,
  observaciones  text,
  firma_responsable text,
  firma_responsable_id text,
  firma_responsable_path text,
  registrado_por text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_iperc_empresa on iperc(empresa_id);
create index if not exists idx_iperc_creador on iperc(creado_por_dni);

create table if not exists iperc_peligros (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references iperc(uuid) on delete cascade,
  peligro        text,
  riesgo         text,
  probabilidad   text,
  severidad      text,
  nivel_riesgo   text,
  jerarquia      text,
  controles      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_iperc_peligros_padre on iperc_peligros(parent_uuid);

-- ── 08_PETAR ──────────────────────────────────────────────────────
create table if not exists petar (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  tipo_trabajo   text,
  descripcion    text,
  area           text,
  lugar_especifico text,
  fecha          date,
  hora_inicio    text,
  hora_fin       text,
  empresa        text,
  ejecutante_dni text,
  num_trabajadores text,
  supervisor_dni text,
  iperc_referencia text,
  estado         text,
  aprobado_por   text,
  fecha_aprobacion date,
  hora_cierre    text,
  observaciones  text,
  controles_no_cumple text,
  total_controles text,
  firma_solicitante text,
  firma_solicitante_id text,
  firma_solicitante_path text,
  firma_aprobador text,
  firma_aprobador_id text,
  firma_aprobador_path text,
  registrado_por text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_petar_empresa on petar(empresa_id);
create index if not exists idx_petar_creador on petar(creado_por_dni);

create table if not exists petar_verificaciones (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references petar(uuid) on delete cascade,
  item           text,
  cumple         text,
  observacion    text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_petar_verificaciones_padre on petar_verificaciones(parent_uuid);

-- ── 09_EPP ────────────────────────────────────────────────────────
create table if not exists epp (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  trabajador_dni text,
  nombre_trabajador text,
  area           text,
  puesto         text,
  tipo_entrega   text,
  fecha_entrega  date,
  entregado_por  text,
  estado         text,
  observaciones  text,
  total_items    text,
  proxima_reposicion date,
  firma_trabajador text,
  firma_trabajador_id text,
  firma_trabajador_path text,
  foto_cargo     text,
  foto_cargo_id  text,
  foto_cargo_path text,
  registrado_por text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_epp_empresa on epp(empresa_id);
create index if not exists idx_epp_creador on epp(creado_por_dni);

create table if not exists epp_items (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references epp(uuid) on delete cascade,
  equipo         text,
  marca          text,
  talla          text,
  cantidad       numeric,
  vida_util      text,
  fecha_reposicion date,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_epp_items_padre on epp_items(parent_uuid);

-- ── 10_Charlas ────────────────────────────────────────────────────
create table if not exists charlas (
  empresa_id     uuid not null references empresas(id) on delete cascade,
  uuid           text primary key,
  tema           text,
  categoria      text,
  fecha          date,
  hora           text,
  turno          text,
  area           text,
  lugar          text,
  expositor_dni  text,
  expositor      text,
  duracion_min   text,
  puntos_tratados text,
  compromisos    text,
  total_asistentes text,
  estado         text,
  firma_expositor text,
  firma_expositor_id text,
  firma_expositor_path text,
  foto_charla    text,
  foto_charla_id text,
  foto_charla_path text,
  registrado_por text,
  fecha_registro date,
  creado_por     uuid references usuarios(id),
  creado_por_dni text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_charlas_empresa on charlas(empresa_id);
create index if not exists idx_charlas_creador on charlas(creado_por_dni);

create table if not exists charlas_asistentes (
  id             bigserial primary key,
  empresa_id     uuid not null references empresas(id) on delete cascade,
  parent_uuid    text not null references charlas(uuid) on delete cascade,
  dni            text,
  nombre         text,
  area_asis      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_charlas_asistentes_padre on charlas_asistentes(parent_uuid);
