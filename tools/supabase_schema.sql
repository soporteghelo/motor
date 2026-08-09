-- =========================================================================
-- SUPABASE SCHEMA — MOTOR PWA Zero-Touch
-- Generado por: node tools/migrate_to_supabase.js
-- Fecha: 2026-06-09
-- =========================================================================
-- INSTRUCCIONES:
--   1. Abre Supabase → SQL Editor
--   2. Pega este script completo y ejecuta (Run)
--   3. Configura AppState.Supabase.URL y AppState.Supabase.ANON_KEY
--   4. Cambia AppState.DB_PROVIDER a 'supabase'
-- =========================================================================

-- Extensión para UUID (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 01_Usuarios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "usuarios" (
  "UUID"  TEXT PRIMARY KEY,
  "DNI"  TEXT NOT NULL,
  "Nombre_Completo"  TEXT NOT NULL,
  "Email"  TEXT NOT NULL,
  "Password_Hash"  TEXT NOT NULL,
  "Rol"  TEXT NOT NULL,
  "Status"  TEXT NOT NULL,
  "Foto_Perfil"  TEXT,
  "Foto_Perfil_ID"  TEXT,
  "Foto_Perfil_Path"  TEXT,
  "Firma_Cargo"  TEXT,
  "Firma_Cargo_ID"  TEXT,
  "Firma_Cargo_Path"  TEXT
);

ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;

-- Política abierta (reemplazar con políticas reales en producción)
CREATE POLICY "allow_all_usuarios"
  ON "usuarios" FOR ALL
  USING (true)
  WITH CHECK (true);
-- ── 02_Reportes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reportes" (
  "UUID"  TEXT PRIMARY KEY,
  "Fecha_Emision"  TIMESTAMPTZ NOT NULL,
  "Inspector_DNI"  TEXT NOT NULL,
  "Categoria_Reporte"  TEXT NOT NULL,
  "Nivel_Severidad"  TEXT NOT NULL,
  "Evidencia_Fotografica"  TEXT,
  "Evidencia_Fotografica_ID"  TEXT,
  "Evidencia_Fotografica_Path"  TEXT,
  "Firma_Operario"  TEXT NOT NULL,
  "Firma_Operario_ID"  TEXT,
  "Firma_Operario_Path"  TEXT
);

ALTER TABLE "reportes" ENABLE ROW LEVEL SECURITY;

-- Política abierta (reemplazar con políticas reales en producción)
CREATE POLICY "allow_all_reportes"
  ON "reportes" FOR ALL
  USING (true)
  WITH CHECK (true);
-- ── 03_Inspecciones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inspecciones" (
  "UUID"  TEXT PRIMARY KEY,
  "Fecha_Peru"  TIMESTAMPTZ NOT NULL,
  "Auditor_DNI"  TEXT NOT NULL,
  "Area_Inspeccion"  TEXT NOT NULL,
  "Tipo_Hallazgo"  TEXT NOT NULL,
  "Descripcion_Tecnica"  TEXT NOT NULL,
  "Estado_Actual"  TEXT NOT NULL,
  "Evidencia_Fotos"  TEXT,
  "Evidencia_Fotos_ID"  TEXT,
  "Evidencia_Fotos_Path"  TEXT,
  "Firma_Digital"  TEXT NOT NULL,
  "Firma_Digital_ID"  TEXT,
  "Firma_Digital_Path"  TEXT
);

ALTER TABLE "inspecciones" ENABLE ROW LEVEL SECURITY;

-- Política abierta (reemplazar con políticas reales en producción)
CREATE POLICY "allow_all_inspecciones"
  ON "inspecciones" FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Tabla de auditoría (equivalente a _SYNC_LOG) ──────────────────────────
CREATE TABLE IF NOT EXISTS "sync_log" (
  "id"          BIGSERIAL PRIMARY KEY,
  "Timestamp"   TIMESTAMPTZ DEFAULT NOW(),
  "Modulo"      TEXT,
  "Accion"      TEXT,
  "UUID_Registro" TEXT,
  "Usuario_DNI" TEXT,
  "Resultado"   TEXT DEFAULT 'OK',
  "Detalle"     TEXT
);
ALTER TABLE "sync_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_sync_log"
  ON "sync_log" FOR ALL
  USING (true)
  WITH CHECK (true);
