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
-- =========================================================================

create or replace function login_email_de_dni(p_dni text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email from usuarios where dni = p_dni limit 1;
$$;

revoke all on function login_email_de_dni(text) from public;
grant execute on function login_email_de_dni(text) to anon, authenticated;
