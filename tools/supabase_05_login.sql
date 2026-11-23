-- =========================================================================
-- MOTOR PWA · Login por DNI contra Supabase Auth
-- =========================================================================
-- La PWA inicia sesión con DNI + contraseña, pero Supabase Auth identifica
-- usuarios por email. Esta función resuelve DNI -> email para que el
-- frontend pueda llamar después a /auth/v1/token?grant_type=password.
--
-- Es SECURITY DEFINER: corre con los privilegios de quien la creó, así que
-- puede leer `usuarios` aunque quien pregunta todavía sea anónimo (no ha
-- iniciado sesión). Solo expone el email — ningún otro dato de la fila.
--
-- ENDURECIMIENTO
-- Al ser anónima, sin límite permitía recorrer los DNIs (8 dígitos) y
-- cosechar el email de todos los usuarios de todas las empresas. Ahora:
--   · máximo 20 consultas por IP cada 10 minutos (tabla login_consultas);
--   · no responde para cuentas Cesadas o Inactivas.
-- La IP se toma de cf-connecting-ip (la fija el proxy de Supabase), con
-- respaldo en x-real-ip y en el primer salto de x-forwarded-for.
-- Es seguro ejecutarlo varias veces.
-- =========================================================================

create table if not exists login_consultas (
  ip       text        not null,
  ventana  timestamptz not null,
  n        integer     not null default 0,
  primary key (ip, ventana)
);
-- RLS sin políticas: nadie la lee ni la escribe por la API; solo la función.
alter table login_consultas enable row level security;
revoke all on login_consultas from anon, authenticated;

-- Se reemplaza la versión anterior (language sql stable): ahora escribe en
-- login_consultas, así que es volatile.
drop function if exists login_email_de_dni(text);
create function login_email_de_dni(p_dni text)
returns text
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_h       jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip      text;
  v_ventana timestamptz := date_trunc('hour', now())
                           + make_interval(mins => (extract(minute from now())::int / 10) * 10);
  v_n       integer;
begin
  v_ip := coalesce(nullif(trim(v_h ->> 'cf-connecting-ip'), ''),
                   nullif(trim(v_h ->> 'x-real-ip'), ''),
                   nullif(trim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''),
                   'sin-ip');

  insert into login_consultas as lc (ip, ventana, n) values (v_ip, v_ventana, 1)
  on conflict (ip, ventana) do update set n = lc.n + 1
  returning n into v_n;

  if v_n > 20 then
    raise exception 'Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.'
      using errcode = 'P0001';
  end if;

  -- Limpieza ocasional de ventanas viejas (sin cron)
  if random() < 0.02 then
    delete from login_consultas where ventana < now() - interval '1 day';
  end if;

  return (select email from usuarios
           where dni = trim(p_dni)
             and lower(coalesce(status, '')) not in ('cesado', 'inactivo')
           limit 1);
end $$;

revoke all on function login_email_de_dni(text) from public;
grant execute on function login_email_de_dni(text) to anon, authenticated;
