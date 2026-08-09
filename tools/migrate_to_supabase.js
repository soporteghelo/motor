/**
 * migrate_to_supabase.js
 * =========================================================================
 * Genera el schema SQL para Supabase a partir de los subconfiguraciones
 * del proyecto MOTOR PWA.
 *
 * USO:
 *   node tools/migrate_to_supabase.js
 *
 * SALIDA:
 *   tools/supabase_schema.sql  ← Pega este SQL en el editor SQL de Supabase
 *   tools/supabase_seed.sql    ← Datos de prueba (opcional)
 *
 * PASOS PARA MIGRAR:
 *   1. Ejecutar este script: node tools/migrate_to_supabase.js
 *   2. En Supabase → SQL Editor → pegar y ejecutar supabase_schema.sql
 *   3. En Global_Config.js.html:
 *        DB_PROVIDER: 'supabase',
 *        Supabase: { URL: 'https://xxxx.supabase.co', ANON_KEY: 'tu-anon-key' }
 *   4. node generate_preview.js && desplegar
 * =========================================================================
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Inferencia de tipos SQL desde nombres y tipos de campo MOTOR ──────────
function inferSqlType(fieldName, motorType) {
  const name = (fieldName || '').toLowerCase();
  const type = (motorType || 'text').toLowerCase();

  if (type === 'hidden_uuid' || name === 'uuid')          return 'TEXT PRIMARY KEY';
  if (type === 'number')                                   return 'NUMERIC';
  if (type === 'boolean')                                  return 'BOOLEAN DEFAULT FALSE';
  if (type === 'date')                                     return 'TIMESTAMPTZ';
  if (type === 'password')                                 return 'TEXT';
  if (type === 'image' || type === 'signature')            return 'TEXT';
  if (type === 'enumlist')                                 return 'TEXT';
  if (name.endsWith('_id') && type === 'hidden')          return 'TEXT';
  if (name.endsWith('_path') && type === 'hidden')        return 'TEXT';
  if (name.endsWith('_hash'))                             return 'TEXT';
  if (name.startsWith('fecha') || name.endsWith('_at'))   return 'TIMESTAMPTZ';
  if (name === 'pdf_url')                                  return 'TEXT';
  return 'TEXT';
}

// ── Leer y parsear un subconfig desde archivo .html ───────────────────────
function parseSubconfig(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');

  // Extraer nombre de variable (ej: SUBCONFIG_01_USUARIOS)
  const varMatch = content.match(/var\s+(SUBCONFIG_\w+)\s*=/);
  if (!varMatch) return null;

  // Extraer bloque Variables — acepta tanto "Variables" como Variables (con/sin comillas)
  let varBlockText = null;
  const varBlockMatch = content.match(/["']?Variables["']?\s*:\s*\{([\s\S]*)\}\s*\}\s*;?\s*<\/script>/);
  if (varBlockMatch) {
    varBlockText = varBlockMatch[1];
  } else {
    const fallback = content.match(/["']?Variables["']?\s*:\s*\{([\s\S]*)/);
    if (!fallback) return null;
    varBlockText = fallback[1];
  }

  const fields = {};
  // Regex: captura campos con o sin comillas en el nombre
  // Formato: "NombreCampo": { ... } o NombreCampo: { ... }
  const fieldRegex = /["']?(\w+)["']?\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = fieldRegex.exec(varBlockText)) !== null) {
    const fieldName = m[1];
    // Ignorar si parece una entrada de acceptedValues u otro objeto anidado
    if (['acceptedValues', 'slice', 'canCreate', 'canRead'].includes(fieldName)) continue;
    const typeMatch = m[2].match(/["']?type["']?\s*:\s*["']([^"']+)["']/);
    const reqMatch  = m[2].match(/["']?required["']?\s*:\s*(true|false)/);
    if (!typeMatch) continue;
    fields[fieldName] = {
      type:     typeMatch[1],
      required: reqMatch ? reqMatch[1] === 'true' : false
    };
  }

  // Extraer Config_Modular — acepta con/sin comillas
  const configMatch = content.match(/["']?Config_Modular["']?\s*:\s*\{([\s\S]*?)\},\s*["']?Variables["']?/);
  const config = {};
  if (configMatch) {
    const nameMatch  = configMatch[1].match(/["']?NombreInterno["']?\s*:\s*["']([^"']+)["']/);
    const childMatch = configMatch[1].match(/["']?CHILD_TABLE["']?\s*:\s*["']([^"']*)["']/);
    if (nameMatch)  config.nombre      = nameMatch[1];
    if (childMatch) config.child_table = childMatch[1];
  }

  return { varName: varMatch[1], fields, config };
}

// ── Convertir nombre de módulo a nombre de tabla SQL ─────────────────────
function toTableName(moduleName) {
  return moduleName.replace(/^\d+_/, '').toLowerCase();
}

// ── Generar SQL para una tabla ────────────────────────────────────────────
function generateTableSQL(moduleName, subconfig) {
  const tableName = toTableName(moduleName);
  const fields    = subconfig.fields;
  const lines     = [];

  lines.push(`-- ── ${moduleName} ──────────────────────────────────────────────`);
  lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);

  const cols = [];
  for (const [fieldName, meta] of Object.entries(fields)) {
    const sqlType = inferSqlType(fieldName, meta.type);
    const notNull = meta.required && !sqlType.includes('PRIMARY KEY') ? ' NOT NULL' : '';
    if (sqlType.includes('PRIMARY KEY')) {
      cols.push(`  "${fieldName}"  ${sqlType}`);
    } else {
      cols.push(`  "${fieldName}"  ${sqlType}${notNull}`);
    }
  }

  lines.push(cols.join(',\n'));
  lines.push(');');
  lines.push('');

  // RLS — Row Level Security (habilitado por defecto, sin políticas restrictivas)
  lines.push(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
  lines.push('');
  lines.push(`-- Política abierta (reemplazar con políticas reales en producción)`);
  lines.push(`CREATE POLICY "allow_all_${tableName}"`);
  lines.push(`  ON "${tableName}" FOR ALL`);
  lines.push(`  USING (true)`);
  lines.push(`  WITH CHECK (true);`);
  lines.push('');

  return lines.join('\n');
}

// ── Descubrir todos los subconfiguraciones ────────────────────────────────
function discoverModules() {
  const modules = [];
  const entries = fs.readdirSync(ROOT);

  for (const entry of entries) {
    const fullPath = path.join(ROOT, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    if (entry.startsWith('00_Config') || entry.startsWith('.')) continue;

    // Buscar archivo subconfig_*.js.html o subconfig_*.js
    const files = fs.readdirSync(fullPath);
    const subconfigFile = files.find(f => f.startsWith('subconfig_') && (f.endsWith('.js.html') || f.endsWith('.js')));
    if (!subconfigFile) continue;

    const subconfigPath = path.join(fullPath, subconfigFile);
    const subconfig = parseSubconfig(subconfigPath);
    if (!subconfig) continue;

    modules.push({ moduleName: entry, subconfigPath, subconfig });
  }

  // También buscar subconfiguraciones dentro de 00_Config
  const configDir = path.join(ROOT, '00_Config');
  if (fs.existsSync(configDir)) {
    const configEntries = fs.readdirSync(configDir);
    for (const entry of configEntries) {
      const fullPath = path.join(configDir, entry);
      if (!fs.statSync(fullPath).isDirectory()) continue;

      const files = fs.readdirSync(fullPath);
      const subconfigFile = files.find(f => f.startsWith('subconfig_') && (f.endsWith('.js.html') || f.endsWith('.js')));
      if (!subconfigFile) continue;

      const subconfigPath = path.join(fullPath, subconfigFile);
      const subconfig = parseSubconfig(subconfigPath);
      if (!subconfig) continue;

      modules.push({ moduleName: entry, subconfigPath, subconfig });
    }
  }

  return modules;
}

// ── Generar header del archivo SQL ────────────────────────────────────────
function sqlHeader() {
  return `-- =========================================================================
-- SUPABASE SCHEMA — MOTOR PWA Zero-Touch
-- Generado por: node tools/migrate_to_supabase.js
-- Fecha: ${new Date().toISOString().substring(0, 10)}
-- =========================================================================
-- INSTRUCCIONES:
--   1. Abre Supabase → SQL Editor
--   2. Pega este script completo y ejecuta (Run)
--   3. Configura AppState.Supabase.URL y AppState.Supabase.ANON_KEY
--   4. Cambia AppState.DB_PROVIDER a 'supabase'
-- =========================================================================

-- Extensión para UUID (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('🚀 MOTOR PWA — Generador de Schema Supabase\n');

  const modules = discoverModules();

  if (modules.length === 0) {
    console.warn('⚠️  No se encontraron módulos con subconfig. Verifica la estructura del proyecto.');
    process.exit(1);
  }

  console.log(`📦 Módulos encontrados: ${modules.length}`);
  modules.forEach(m => console.log(`   - ${m.moduleName} (${Object.keys(m.subconfig.fields).length} campos)`));
  console.log('');

  let schemaSql = sqlHeader();

  for (const { moduleName, subconfig } of modules) {
    const tableSQL = generateTableSQL(moduleName, subconfig);
    schemaSql += tableSQL;
    console.log(`✅ ${moduleName} → tabla "${toTableName(moduleName)}" generada.`);
  }

  // Tabla de log de auditoría
  schemaSql += `
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
`;

  const outputPath = path.join(__dirname, 'supabase_schema.sql');
  fs.writeFileSync(outputPath, schemaSql, 'utf8');
  console.log(`\n✅ Schema generado en: tools/supabase_schema.sql`);

  // Instrucciones de configuración
  console.log('\n── PRÓXIMOS PASOS ──────────────────────────────────────────');
  console.log('1. Ve a https://supabase.com → Tu proyecto → SQL Editor');
  console.log('2. Pega y ejecuta el contenido de: tools/supabase_schema.sql');
  console.log('3. En Global_Config.js.html, configura:');
  console.log('     DB_PROVIDER: \'supabase\',');
  console.log('     Supabase: {');
  console.log('       URL: \'https://tu-proyecto.supabase.co\',');
  console.log('       ANON_KEY: \'tu-anon-key-publica\'');
  console.log('     }');
  console.log('4. Ejecuta: node generate_preview.js');
  console.log('5. Copia PROD_INDEX.html a Apps Script y despliega.');
  console.log('───────────────────────────────────────────────────────────\n');
}

main();
