-- =========================================================================
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
  '{"02_Reportes":true,"03_Inspecciones":true,"04_Actos_Condiciones":true,"05_Incidentes":true,"06_Capacitaciones":true,"07_IPERC":true,"08_PETAR":true,"09_EPP":true,"10_Charlas":true,"11_Webs":true}'::jsonb,
  current_date + interval '30 days'
)
on conflict (id) do nothing;
