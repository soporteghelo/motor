-- =========================================================================
-- MOTOR PWA · Migración — campos de Flash Report en 05_Incidentes
-- =========================================================================
-- supabase_01_schema.sql usa "create table if not exists", así que
-- regenerarlo NO agrega columnas a una tabla que ya existe en producción.
-- Este archivo es el delta real a ejecutar contra la base ya desplegada.
--
-- Ejecutar una sola vez en el editor SQL de Supabase. Es seguro correrlo
-- más de una vez (IF NOT EXISTS en cada columna).
-- =========================================================================

alter table incidentes
  add column if not exists severidad_potencial text,
  add column if not exists tipo_personal text,
  add column if not exists acciones_inmediatas text,
  add column if not exists equipo_involucrado text,
  add column if not exists costo_estimado_danos text,
  add column if not exists requiere_notificacion_autoridad text,
  add column if not exists notificados text;
