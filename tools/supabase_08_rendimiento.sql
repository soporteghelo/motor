-- =========================================================================
-- MOTOR PWA · Rendimiento con miles de registros
-- Generado por tools/gen_supabase.js — no editar a mano
--
-- Idempotente: se puede volver a ejecutar sobre una base ya desplegada.
-- CREATE INDEX bloquea escrituras mientras construye el índice; sobre
-- una tabla ya grande conviene cambiarlo a CREATE INDEX CONCURRENTLY
-- (que no se puede usar dentro de una transacción).
-- =========================================================================

create extension if not exists pg_trgm;

-- ── 02_Reportes ───────────────────────────────────────────────────
create index if not exists idx_reportes_pagina on reportes (empresa_id, creado_en desc);
create index if not exists idx_reportes_fecha_emision on reportes (empresa_id, fecha_emision);
create index if not exists idx_reportes_inspector_dni_txt on reportes using gin (inspector_dni gin_trgm_ops);
create index if not exists idx_reportes_categoria_reporte on reportes (empresa_id, categoria_reporte);
create index if not exists idx_reportes_nivel_severidad on reportes (empresa_id, nivel_severidad);
create index if not exists idx_reportes_child_empresa on reportes_child (empresa_id);

-- ── 03_Inspecciones ───────────────────────────────────────────────
create index if not exists idx_inspecciones_pagina on inspecciones (empresa_id, creado_en desc);
create index if not exists idx_inspecciones_fecha_peru on inspecciones (empresa_id, fecha_peru);
create index if not exists idx_inspecciones_auditor_dni_txt on inspecciones using gin (auditor_dni gin_trgm_ops);
create index if not exists idx_inspecciones_area_inspeccion on inspecciones (empresa_id, area_inspeccion);
create index if not exists idx_inspecciones_tipo_hallazgo on inspecciones (empresa_id, tipo_hallazgo);
create index if not exists idx_inspecciones_estado_actual on inspecciones (empresa_id, estado_actual);
create index if not exists idx_inspecciones_responsable_txt on inspecciones using gin (responsable gin_trgm_ops);
create index if not exists idx_inspecciones_plazo on inspecciones (empresa_id, plazo);
create index if not exists idx_inspecciones_child_empresa on inspecciones_child (empresa_id);

-- ── 04_Actos_Condiciones ──────────────────────────────────────────
create index if not exists idx_actos_condiciones_pagina on actos_condiciones (empresa_id, creado_en desc);
create index if not exists idx_actos_condiciones_fecha_reporte on actos_condiciones (empresa_id, fecha_reporte);
create index if not exists idx_actos_condiciones_fecha_incidente on actos_condiciones (empresa_id, fecha_incidente);
create index if not exists idx_actos_condiciones_reportado_por_txt on actos_condiciones using gin (reportado_por gin_trgm_ops);
create index if not exists idx_actos_condiciones_nombre_reportante_txt on actos_condiciones using gin (nombre_reportante gin_trgm_ops);
create index if not exists idx_actos_condiciones_area on actos_condiciones (empresa_id, area);
create index if not exists idx_actos_condiciones_tipo_reporte on actos_condiciones (empresa_id, tipo_reporte);
create index if not exists idx_actos_condiciones_categoria on actos_condiciones (empresa_id, categoria);
create index if not exists idx_actos_condiciones_nivel_riesgo on actos_condiciones (empresa_id, nivel_riesgo);
create index if not exists idx_actos_condiciones_estado on actos_condiciones (empresa_id, estado);
create index if not exists idx_actos_condiciones_fuente on actos_condiciones (empresa_id, fuente);

-- ── 05_Incidentes ─────────────────────────────────────────────────
create index if not exists idx_incidentes_pagina on incidentes (empresa_id, creado_en desc);
create index if not exists idx_incidentes_fecha_evento on incidentes (empresa_id, fecha_evento);
create index if not exists idx_incidentes_tipo_evento on incidentes (empresa_id, tipo_evento);
create index if not exists idx_incidentes_gravedad on incidentes (empresa_id, gravedad);
create index if not exists idx_incidentes_severidad_potencial on incidentes (empresa_id, severidad_potencial);
create index if not exists idx_incidentes_area on incidentes (empresa_id, area);
create index if not exists idx_incidentes_nombre_trabajador_txt on incidentes using gin (nombre_trabajador gin_trgm_ops);
create index if not exists idx_incidentes_tipo_personal on incidentes (empresa_id, tipo_personal);
create index if not exists idx_incidentes_requiere_notificacion_autoridad on incidentes (empresa_id, requiere_notificacion_autoridad);
create index if not exists idx_incidentes_categoria_causa on incidentes (empresa_id, categoria_causa);
create index if not exists idx_incidentes_estado on incidentes (empresa_id, estado);
create index if not exists idx_incidentes_acciones_empresa on incidentes_acciones (empresa_id);

-- ── 06_Capacitaciones ─────────────────────────────────────────────
create index if not exists idx_capacitaciones_pagina on capacitaciones (empresa_id, creado_en desc);
create index if not exists idx_capacitaciones_nombre_capacitacion_txt on capacitaciones using gin (nombre_capacitacion gin_trgm_ops);
create index if not exists idx_capacitaciones_tipo on capacitaciones (empresa_id, tipo);
create index if not exists idx_capacitaciones_tema on capacitaciones (empresa_id, tema);
create index if not exists idx_capacitaciones_modalidad on capacitaciones (empresa_id, modalidad);
create index if not exists idx_capacitaciones_fecha_ejecucion on capacitaciones (empresa_id, fecha_ejecucion);
create index if not exists idx_capacitaciones_instructor_txt on capacitaciones using gin (instructor gin_trgm_ops);
create index if not exists idx_capacitaciones_fecha_vencimiento on capacitaciones (empresa_id, fecha_vencimiento);
create index if not exists idx_capacitaciones_estado on capacitaciones (empresa_id, estado);
create index if not exists idx_capacitaciones_asistentes_empresa on capacitaciones_asistentes (empresa_id);

-- ── 07_IPERC ──────────────────────────────────────────────────────
create index if not exists idx_iperc_pagina on iperc (empresa_id, creado_en desc);
create index if not exists idx_iperc_proceso_txt on iperc using gin (proceso gin_trgm_ops);
create index if not exists idx_iperc_tipo_iperc on iperc (empresa_id, tipo_iperc);
create index if not exists idx_iperc_area on iperc (empresa_id, area);
create index if not exists idx_iperc_fecha_elaboracion on iperc (empresa_id, fecha_elaboracion);
create index if not exists idx_iperc_fecha_revision on iperc (empresa_id, fecha_revision);
create index if not exists idx_iperc_estado on iperc (empresa_id, estado);
create index if not exists idx_iperc_riesgo_maximo on iperc (empresa_id, riesgo_maximo);
create index if not exists idx_iperc_peligros_empresa on iperc_peligros (empresa_id);

-- ── 08_PETAR ──────────────────────────────────────────────────────
create index if not exists idx_petar_pagina on petar (empresa_id, creado_en desc);
create index if not exists idx_petar_tipo_trabajo on petar (empresa_id, tipo_trabajo);
create index if not exists idx_petar_area on petar (empresa_id, area);
create index if not exists idx_petar_fecha on petar (empresa_id, fecha);
create index if not exists idx_petar_empresa_txt on petar using gin (empresa gin_trgm_ops);
create index if not exists idx_petar_estado on petar (empresa_id, estado);
create index if not exists idx_petar_verificaciones_empresa on petar_verificaciones (empresa_id);

-- ── 09_EPP ────────────────────────────────────────────────────────
create index if not exists idx_epp_pagina on epp (empresa_id, creado_en desc);
create index if not exists idx_epp_nombre_trabajador_txt on epp using gin (nombre_trabajador gin_trgm_ops);
create index if not exists idx_epp_area on epp (empresa_id, area);
create index if not exists idx_epp_tipo_entrega on epp (empresa_id, tipo_entrega);
create index if not exists idx_epp_fecha_entrega on epp (empresa_id, fecha_entrega);
create index if not exists idx_epp_estado on epp (empresa_id, estado);
create index if not exists idx_epp_proxima_reposicion on epp (empresa_id, proxima_reposicion);
create index if not exists idx_epp_items_empresa on epp_items (empresa_id);

-- ── 10_Charlas ────────────────────────────────────────────────────
create index if not exists idx_charlas_pagina on charlas (empresa_id, creado_en desc);
create index if not exists idx_charlas_tema_txt on charlas using gin (tema gin_trgm_ops);
create index if not exists idx_charlas_categoria on charlas (empresa_id, categoria);
create index if not exists idx_charlas_fecha on charlas (empresa_id, fecha);
create index if not exists idx_charlas_turno on charlas (empresa_id, turno);
create index if not exists idx_charlas_area on charlas (empresa_id, area);
create index if not exists idx_charlas_expositor_txt on charlas using gin (expositor gin_trgm_ops);
create index if not exists idx_charlas_estado on charlas (empresa_id, estado);
create index if not exists idx_charlas_asistentes_empresa on charlas_asistentes (empresa_id);

-- ── Conteos y sumas en la base, no en el navegador ────────────────────
--
-- Un KPI NO puede contar sobre las filas cargadas: con la tabla paginada
-- dejaria fuera todo lo que no esta en pantalla (una inspeccion vencida
-- de hace ocho meses) y el tablero mentiria sin avisar.
--
-- security invoker: se ejecuta con los permisos de quien llama, asi que
-- el RLS se aplica igual que en una consulta normal. Un trabajador
-- cuenta solo lo suyo. NO cambiar a security definer: convertiria esta
-- funcion en un agujero para leer la base de otras empresas.
--
-- Los identificadores pasan por format(%I) y los valores por %L, de modo
-- que no hay inyeccion posible desde p_cond; ademas tabla y columnas se
-- validan contra la lista blanca y el catalogo.

-- WHERE a partir de las condiciones declarativas del KPI.
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
  v_tablas text[] := array['reportes', 'inspecciones', 'actos_condiciones', 'incidentes', 'capacitaciones', 'iperc', 'petar', 'epp', 'charlas'];
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
$fn$;

revoke all on function motor_cond_sql(text, jsonb) from public, anon;
grant execute on function motor_cond_sql(text, jsonb) to authenticated;
revoke all on function motor_agregado(text, text, text, jsonb) from public, anon;
grant execute on function motor_agregado(text, text, text, jsonb) to authenticated;

-- Planificador al dia: sin esto los indices nuevos tardan en usarse.
analyze reportes;
analyze inspecciones;
analyze actos_condiciones;
analyze incidentes;
analyze capacitaciones;
analyze iperc;
analyze petar;
analyze epp;
analyze charlas;
