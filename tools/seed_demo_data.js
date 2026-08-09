/**
 * =========================================================================
 * MOTOR PWA · Seed de datos de demostración → Supabase
 * =========================================================================
 * Crea 5 empresas, usuarios con los 4 roles (SuperAdmin, Admin, Supervisor,
 * Trabajador) y registros de ejemplo en los 9 módulos operativos
 * (02_Reportes … 10_Charlas), respetando el alcance de cada rol:
 *
 *   SuperAdmin  → no pertenece a ninguna empresa, ve todas.
 *   Admin       → 1 por empresa, dueño administrativo de todo lo suyo.
 *   Supervisor  → 2 por empresa, aparecen como auditor/aprobador/revisor/
 *                 instructor/expositor en los registros (alcance "responsable").
 *   Trabajador  → 4 por empresa, generan sus propios registros (alcance "propios").
 *
 * POR QUÉ UN SCRIPT Y NO SOLO SQL
 * `usuarios.id` referencia `auth.users(id)`. Crear usuarios reales de Supabase
 * Auth requiere la Admin API (service_role), no es un simple INSERT SQL.
 * Este script hace ambas cosas: crea el usuario de Auth y su fila en
 * `usuarios`, y luego inserta los datos de cada módulo vía REST
 * (PostgREST), que con la service_role key ignora RLS.
 *
 * REQUISITOS PREVIOS
 *   1. Haber ejecutado supabase_01_schema.sql, 02_rls.sql y 03_storage.sql
 *      en el editor SQL de Supabase (ver tools/README si hiciera falta).
 *
 * USO
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node tools/seed_demo_data.js
 *
 *   Variables de entorno:
 *     SUPABASE_URL               (opcional, por defecto el proyecto configurado
 *                                  en 00_Config/Global_Config.js.html)
 *     SUPABASE_SERVICE_ROLE_KEY  (obligatoria: Supabase → Settings → API →
 *                                  service_role. NUNCA se pega en el frontend
 *                                  ni se sube al repo)
 *     DEMO_PASSWORD              (opcional, contraseña de todos los usuarios
 *                                  sembrados; por defecto "Demo1234!")
 *     DRY_RUN=1                  (genera los datos y muestra los conteos,
 *                                  sin llamar a Supabase — para previsualizar)
 *
 * Es seguro re-ejecutar: los usuarios de Auth se detectan por email y se
 * reutilizan; las filas de datos usan IDs fijos y se insertan con
 * upsert (on_conflict), así que una segunda corrida actualiza en vez de
 * duplicar.
 * =========================================================================
 */

const SUPABASE_URL  = process.env.SUPABASE_URL || 'https://fkelhhfptckarqgknkfh.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234!';
const DRY_RUN       = process.env.DRY_RUN === '1';

if (!DRY_RUN && !SERVICE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Cópiala desde Supabase → Settings → API → service_role y ejecuta:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=xxxx node tools/seed_demo_data.js');
  console.error('(o corre con DRY_RUN=1 para solo previsualizar los datos generados)');
  process.exit(1);
}
if (typeof fetch !== 'function') {
  console.error('Este script requiere Node 18+ (usa fetch nativo).');
  process.exit(1);
}

// =========================================================================
// 1. HTTP helpers (PostgREST + Auth Admin API)
// =========================================================================
async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function upsertRows(table, rows, onConflict) {
  if (!rows.length) return;
  if (DRY_RUN) {
    console.log(`  [dry-run] ${table}: ${rows.length} filas (ejemplo: ${JSON.stringify(rows[0]).slice(0, 160)}...)`);
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await rest(`/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk)
    });
  }
  console.log(`  -> ${table}: ${rows.length} filas`);
}

async function findAuthUserIdByEmail(email) {
  const data = await rest(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
  const list = Array.isArray(data) ? data : (data && data.users) || [];
  const found = list.find(u => u.email === email);
  return found ? found.id : null;
}

async function ensureAuthUser(persona) {
  if (DRY_RUN) return `dry-run-${persona.dni}`;
  let id = await findAuthUserIdByEmail(persona.email).catch(() => null);
  if (id) return id;
  const created = await rest('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: persona.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      app_metadata: { rol: persona.rol, empresa_id: persona.empresa_id, dni: persona.dni },
      user_metadata: { nombre: persona.nombre }
    })
  });
  return created.id;
}

// =========================================================================
// 2. RNG determinista (para que re-ejecutar produzca los mismos datos)
// =========================================================================
let _seed = 42;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function randInt(min, max) { return min + Math.floor(rnd() * (max - min + 1)); }
function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }
function monthsAfter(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return iso(d);
}
function slug(s) {
  return s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// =========================================================================
// 3. Empresas y personas
// =========================================================================
const EMPRESAS = [
  {
    n: 1, id: '00000000-0000-0000-0000-000000000001',
    nombre: 'Minera Andina S.A.C.', ruc: '20100000001', plan: 'pro', slugEmp: 'mineraandina',
    modulos: { '02_Reportes': true, '03_Inspecciones': true, '04_Actos_Condiciones': true, '05_Incidentes': true, '06_Capacitaciones': true, '07_IPERC': true, '08_PETAR': true, '09_EPP': true, '10_Charlas': true }
  },
  {
    n: 2, id: '00000000-0000-0000-0000-000000000002',
    nombre: 'Constructora Horizonte S.A.', ruc: '20100000002', plan: 'pro', slugEmp: 'chorizonte',
    modulos: { '02_Reportes': true, '03_Inspecciones': true, '04_Actos_Condiciones': true, '05_Incidentes': true, '06_Capacitaciones': true, '07_IPERC': true, '08_PETAR': true, '09_EPP': true, '10_Charlas': true }
  },
  {
    n: 3, id: '00000000-0000-0000-0000-000000000003',
    nombre: 'Logística del Pacífico S.A.C.', ruc: '20100000003', plan: 'basico', slugEmp: 'logpacifico',
    // Plan básico: sin IPERC ni PETAR (se activan al subir de plan).
    modulos: { '02_Reportes': true, '03_Inspecciones': true, '04_Actos_Condiciones': true, '05_Incidentes': true, '06_Capacitaciones': true, '07_IPERC': false, '08_PETAR': false, '09_EPP': true, '10_Charlas': true }
  },
  {
    n: 4, id: '00000000-0000-0000-0000-000000000004',
    nombre: 'Planta Industrial San Martín S.A.C.', ruc: '20100000004', plan: 'pro', slugEmp: 'plantasanmartin',
    modulos: { '02_Reportes': true, '03_Inspecciones': true, '04_Actos_Condiciones': true, '05_Incidentes': true, '06_Capacitaciones': true, '07_IPERC': true, '08_PETAR': true, '09_EPP': true, '10_Charlas': true }
  },
  {
    n: 5, id: '00000000-0000-0000-0000-000000000005',
    nombre: 'Servicios Energéticos del Sur S.A.C.', ruc: '20100000005', plan: 'trial', slugEmp: 'energeticasur',
    trialHasta: daysAgo(-30),
    modulos: { '02_Reportes': true, '03_Inspecciones': true, '04_Actos_Condiciones': true, '05_Incidentes': true, '06_Capacitaciones': true, '07_IPERC': true, '08_PETAR': true, '09_EPP': true, '10_Charlas': true }
  }
];

// Plantilla de plantilla de personal, igual para las 5 empresas.
const ROSTER = [
  { rol: 'admin',      puesto: 'Gerente de Operaciones',      area: 'Administración' },
  { rol: 'supervisor', puesto: 'Supervisor SSOMA',             area: 'Operaciones' },
  { rol: 'supervisor', puesto: 'Supervisor de Mantenimiento',  area: 'Mantenimiento' },
  { rol: 'trabajador', puesto: 'Operador',                     area: 'Operaciones' },
  { rol: 'trabajador', puesto: 'Técnico de Mantenimiento',     area: 'Mantenimiento' },
  { rol: 'trabajador', puesto: 'Almacenero',                   area: 'Almacén' },
  { rol: 'trabajador', puesto: 'Ayudante de Campo',            area: 'Obra / Campo' }
];

const NOMBRES_POR_EMPRESA = [
  ['Luis Fernández Quispe', 'José Ramírez Huamán', 'María Quispe Mamani', 'Miguel Torres Salazar', 'Rosa Huamán Ccama', 'Jorge Castillo Vargas', 'Carmen Flores Ticona'],
  ['Pedro Sánchez Flores', 'Ana Salazar Pinto', 'Raúl Gutiérrez Paredes', 'Víctor Chávez Ramos', 'Lucía Ramos Béjar', 'Fernando Rojas Medina', 'Patricia Vargas Cano'],
  ['Diego Vásquez Cruz', 'Silvia Espinoza Tello', 'Alberto Núñez Espinoza', 'Karina Reyes Guevara', 'Ricardo Palomino Reyes', 'Elena Soto Marín', 'Manuel Aguilar Soto'],
  ['Julio Bravo Campos', 'Gladys Campos Rivas', 'Andrés Silva Herrera', 'Verónica Herrera Luna', 'Óscar Delgado Ríos', 'Milagros Ríos Alarcón', 'Enrique Paredes Loza'],
  ['Cecilia Loza Bermúdez', 'Martín Cárdenas Villalobos', 'Sandra Villalobos Ponce', 'Iván Zapata Contreras', 'Diana Contreras Yupanqui', 'Rodrigo Meza Ochoa', 'Judith Ochoa Farfán']
];

const SUPERADMIN = {
  dni: '00000001', nombre: 'Carlos Mendoza Rojas', email: 'superadmin@motorpwa.com',
  rol: 'superadmin', empresa_id: null, area: null, puesto: 'Administrador de plataforma'
};

/** Arma la lista completa de personas (37) con DNI, email y empresa ya resueltos. */
function buildPersonas() {
  const personas = [SUPERADMIN];
  EMPRESAS.forEach(emp => {
    NOMBRES_POR_EMPRESA[emp.n - 1].forEach((nombre, idx) => {
      const cfg = ROSTER[idx];
      const dni = `4${emp.n}0000${String(idx + 1).padStart(2, '0')}`;
      const [pn, sn] = nombre.split(' ');
      personas.push({
        dni, nombre, rol: cfg.rol, puesto: cfg.puesto, area: cfg.area,
        empresa_id: emp.id, empresaN: emp.n,
        email: `${slug(pn)}.${slug(sn)}@${emp.slugEmp}.pe`
      });
    });
  });
  return personas;
}

// =========================================================================
// 4. Generadores de datos por módulo
// =========================================================================
const AREA_INSPECCIONES = ['Mina', 'Planta', 'Talleres', 'Logística'];
const AREA_GENERAL = ['Operaciones', 'Mantenimiento', 'Almacén', 'Logística', 'Producción', 'Administración', 'Obra / Campo', 'Laboratorio'];
const AREA_ACTOS = ['Mina', 'Planta', 'Talleres', 'Logística', 'Administración', 'Almacén'];

const HALLAZGOS = [
  { desc: 'Se identificó desgaste en guarda de seguridad de la máquina; se recomienda reemplazo inmediato.', h: 'Guarda de seguridad deteriorada', r: 'Atrapamiento', rec: 'Reemplazar guarda antes de reanudar operación' },
  { desc: 'Zona de tránsito peatonal sin señalización visible en horario nocturno.', h: 'Falta de señalización en zona de tránsito', r: 'Golpe / atropello', rec: 'Instalar señalización reflectiva' },
  { desc: 'Extintor con fecha de recarga vencida detectado durante recorrido de rutina.', h: 'Extintor vencido', r: 'Incendio no controlado', rec: 'Recargar y reetiquetar extintor' },
  { desc: 'Fuga menor de aceite hidráulico en equipo estacionario, riesgo de resbalón.', h: 'Fuga de aceite hidráulico', r: 'Resbalón / caída', rec: 'Contener la fuga y reparar el sello' },
  { desc: 'Andamio armado sin barandas en nivel superior; trabajo suspendido hasta corrección.', h: 'Andamio sin barandas', r: 'Caída a distinto nivel', rec: 'Instalar barandas reglamentarias' },
  { desc: 'Tablero eléctrico con cableado expuesto; se solicita intervención de mantenimiento.', h: 'Cableado eléctrico expuesto', r: 'Contacto eléctrico', rec: 'Aislar y reforzar canalización' }
];

const ACTOS_DESC = [
  'Trabajador manipulando carga sin usar la faja lumbar asignada.',
  'Piso mojado sin señalización de advertencia cerca del área de lavado.',
  'Extensión eléctrica en mal estado conectada a tablero temporal.',
  'Material apilado por encima de la altura permitida en almacén.',
  'Operario retirando guarda de protección para limpieza rápida de la máquina.',
  'Acceso a escalera bloqueado con materiales, dificultando la evacuación.'
];

const INCIDENTES_DESC = [
  'Corte superficial en mano al manipular lámina metálica sin guantes.',
  'Casi accidente: caída de herramienta desde nivel superior, sin personal debajo en el momento.',
  'Torcedura de tobillo al descender de plataforma por peldaño en mal estado.',
  'Golpe contra estructura fija durante maniobra de retroceso de vehículo.',
  'Exposición breve a humos de soldadura por falla de extracción localizada.',
  'Contacto con superficie caliente durante mantenimiento correctivo no programado.'
];

const IPERC_PROCESOS = ['Operación de equipo móvil', 'Mantenimiento mecánico', 'Carga y descarga de materiales', 'Trabajos en altura programados', 'Operación en planta de proceso', 'Actividades de almacén'];
const IPERC_JERARQUIA = ['Eliminación', 'Sustitución', 'Control de ingeniería', 'Control administrativo', 'EPP'];

function nivelRiesgo(prob, sev) {
  const v = prob * sev;
  if (v <= 4) return 'Trivial';
  if (v <= 8) return 'Tolerable';
  if (v <= 12) return 'Moderado';
  if (v <= 16) return 'Importante';
  return 'Intolerable';
}

const EPP_EQUIPOS = ['Casco de seguridad', 'Lentes de seguridad', 'Careta facial', 'Protector auditivo', 'Respirador / mascarilla', 'Guantes', 'Botines de seguridad', 'Arnés de cuerpo completo', 'Línea de vida', 'Chaleco reflectivo', 'Ropa de trabajo', 'Traje impermeable', 'Guantes dieléctricos', 'Botas dieléctricas'];
const EPP_VIDA_UTIL = { 'Casco de seguridad': '36', 'Lentes de seguridad': '12', 'Careta facial': '24', 'Protector auditivo': '6', 'Respirador / mascarilla': '3', 'Guantes': '3', 'Botines de seguridad': '12', 'Arnés de cuerpo completo': '24', 'Línea de vida': '24', 'Chaleco reflectivo': '12', 'Ropa de trabajo': '12', 'Traje impermeable': '12', 'Guantes dieléctricos': '6', 'Botas dieléctricas': '12' };
const EPP_MARCAS = ['3M', 'MSA', 'Steelpro', 'Truper', 'Libus', 'Karson'];
const EPP_TALLAS = ['S', 'M', 'L', 'XL', 'Única'];

const TEMAS_CHARLA = ['Inspección de herramientas antes de usarlas', 'Uso correcto del arnés de seguridad', 'Orden y limpieza en el puesto de trabajo', 'Levantamiento manual de cargas', 'Reporte de actos y condiciones subestándar', 'Manejo defensivo y tránsito interno', 'Riesgo eléctrico: distancias seguras', 'Hidratación y golpe de calor', 'Ergonomía en tareas repetitivas', 'Qué hacer ante una emergencia', 'Lección aprendida del último incidente', 'Revisión del EPP asignado'];

const PETAR_CHECKLISTS = {
  'Trabajo en altura': ['Arnés de cuerpo completo inspeccionado y con certificación vigente', 'Punto de anclaje verificado (resistencia mínima 2268 kg)', 'Línea de vida instalada y probada', 'Escaleras/andamios inspeccionados y asegurados', 'Área inferior delimitada y señalizada'],
  'Espacio confinado': ['Medición de atmósfera: oxígeno entre 19.5% y 23.5%', 'Ventilación forzada instalada y operativa', 'Vigía permanente asignado en el exterior', 'Equipo de rescate disponible en el punto', 'Comunicación permanente verificada'],
  'Trabajo en caliente': ['Extintor operativo a menos de 3 metros', 'Material combustible retirado en radio de 11 metros', 'Vigía de fuego asignado durante y 30 min después', 'Equipo de soldadura/corte inspeccionado', 'Ventilación adecuada del área'],
  'Trabajo eléctrico': ['Desenergización verificada con instrumento', 'Bloqueo y etiquetado aplicado por cada ejecutante', 'Prueba de ausencia de tensión realizada', 'Puesta a tierra temporal instalada', 'Personal calificado y autorizado']
};
const PETAR_TIPOS = Object.keys(PETAR_CHECKLISTS);

let _uid = 0;
function nextId(prefix) { _uid++; return `${prefix}-${String(_uid).padStart(5, '0')}`; }

/** Genera todos los registros de una empresa. Recibe las personas ya con id de Auth resuelto. */
function buildEmpresaData(emp, personas) {
  const admin = personas.find(p => p.rol === 'admin');
  const sups = personas.filter(p => p.rol === 'supervisor');
  const trabs = personas.filter(p => p.rol === 'trabajador');
  const out = {
    reportes: [], reportes_child: [],
    inspecciones: [], inspecciones_child: [],
    actos_condiciones: [],
    incidentes: [], incidentes_acciones: [],
    capacitaciones: [], capacitaciones_asistentes: [],
    iperc: [], iperc_peligros: [],
    petar: [], petar_verificaciones: [],
    epp: [], epp_items: [],
    charlas: [], charlas_asistentes: []
  };
  const base = emp.n * 100;

  // ── 02_Reportes ── (Trabajador reporta lo suyo)
  if (emp.modulos['02_Reportes']) {
    const CAT = ['Preventivo', 'Auditoría Interna', 'Acto Subestándar', 'Condición Crítica'];
    const SEV = ['Bajo (Verde)', 'Medio (Amarillo)', 'Alto (Rojo)', 'Crítico (Negro)'];
    for (let i = 0; i < 4; i++) {
      const creador = pick(trabs, base + i);
      const uuid = nextId('RPT');
      out.reportes.push({
        empresa_id: emp.id, uuid,
        fecha_emision: daysAgo(randInt(1, 60)),
        inspector_dni: creador.dni,
        categoria_reporte: pick(CAT, base + i),
        nivel_severidad: pick(SEV, base + i + 1),
        creado_por: creador.id, creado_por_dni: creador.dni
      });
      out.reportes_child.push({
        empresa_id: emp.id, parent_uuid: uuid,
        observacion: 'Se notificó al supervisor de turno y queda pendiente de verificación en el próximo recorrido.'
      });
    }
  }

  // ── 03_Inspecciones ── (Supervisor audita, Trabajador queda como responsable del levantamiento)
  if (emp.modulos['03_Inspecciones']) {
    const ESTADOS = ['Pendiente', 'En Proceso', 'Cerrado'];
    for (let i = 0; i < 4; i++) {
      const auditor = pick(sups, base + i);
      const responsable = pick(trabs, base + i + 1);
      const estado = pick(ESTADOS, base + i);
      const uuid = nextId('INS');
      const fecha = daysAgo(randInt(1, 90));
      out.inspecciones.push({
        empresa_id: emp.id, uuid,
        fecha_peru: fecha,
        auditor_dni: auditor.dni,
        area_inspeccion: pick(AREA_INSPECCIONES, emp.n + i),
        tipo_hallazgo: pick(['Seguridad', 'Mantenimiento', 'Ambiental'], base + i),
        descripcion_tecnica: pick(HALLAZGOS, base + i).desc,
        estado_actual: estado,
        responsable: responsable.dni,
        plazo: estado === 'Cerrado' ? null : monthsAfter(fecha, 1),
        creado_por: auditor.id, creado_por_dni: auditor.dni
      });
      for (let c = 0; c < 2; c++) {
        const t = pick(HALLAZGOS, base + i + c);
        out.inspecciones_child.push({ empresa_id: emp.id, parent_uuid: uuid, hallazgo: t.h, riesgo: t.r, recomendacion: t.rec });
      }
    }
  }

  // ── 04_Actos_Condiciones ── (Trabajador reporta, Supervisor modera)
  if (emp.modulos['04_Actos_Condiciones']) {
    const TIPO = ['Acto Subestándar', 'Condición Subestándar'];
    const CATEG = ['EPP', 'Herramientas', 'Equipos', 'Procedimientos', 'Orden y Limpieza', 'Ergonomía', 'Ambiental'];
    const RIESGO = ['Bajo (Verde)', 'Medio (Amarillo)', 'Alto (Rojo)', 'Crítico (Negro)'];
    const ESTADOS = ['Pendiente', 'En Revisión', 'Aprobado', 'Cerrado'];
    for (let i = 0; i < 4; i++) {
      const reportante = pick(trabs, base + i);
      const moderador = pick(sups, base + i);
      const estado = pick(ESTADOS, base + i);
      const cerrado = estado === 'Aprobado' || estado === 'Cerrado';
      const fecha = daysAgo(randInt(1, 75));
      out.actos_condiciones.push({
        empresa_id: emp.id, uuid: nextId('ACT'),
        fecha_reporte: fecha, fecha_incidente: fecha,
        reportado_por: reportante.dni, nombre_reportante: reportante.nombre,
        area: pick(AREA_ACTOS, base + i),
        tipo_reporte: pick(TIPO, base + i),
        categoria: pick(CATEG, base + i),
        nivel_riesgo: pick(RIESGO, base + i + 1),
        descripcion: pick(ACTOS_DESC, base + i),
        estado,
        moderado_por: cerrado ? moderador.dni : null,
        fecha_moderacion: cerrado ? daysAgo(randInt(0, 10)) : null,
        accion_correctiva: cerrado ? 'Se corrigió la condición y se reforzó la charla de seguridad al equipo.' : null,
        fuente: 'App Móvil',
        fecha_registro: fecha,
        creado_por: reportante.id, creado_por_dni: reportante.dni
      });
    }
  }

  // ── 05_Incidentes ── (Trabajador/afectado, Supervisor investiga)
  if (emp.modulos['05_Incidentes']) {
    const TIPO = ['Cuasi accidente', 'Incidente peligroso', 'Accidente sin tiempo perdido'];
    const GRAVEDAD = ['Leve', 'Grave'];
    const CAUSA = ['Factor personal', 'Factor del trabajo', 'Método / procedimiento', 'Equipo / herramienta', 'Entorno / condiciones'];
    const ESTADOS = ['Reportado', 'En investigación', 'Con acciones abiertas', 'Cerrado'];
    for (let i = 0; i < 3; i++) {
      const afectado = pick(trabs, base + i);
      const investigador = pick(sups, base + i);
      const estado = pick(ESTADOS, base + i);
      const uuid = nextId('INC');
      const fecha = daysAgo(randInt(1, 80));
      out.incidentes.push({
        empresa_id: emp.id, uuid,
        fecha_evento: fecha, hora_evento: `${String(randInt(6, 20)).padStart(2, '0')}:00`,
        tipo_evento: pick(TIPO, base + i),
        gravedad: pick(GRAVEDAD, base + i),
        area: pick(AREA_GENERAL, base + i),
        descripcion: pick(INCIDENTES_DESC, base + i),
        trabajador_dni: afectado.dni, nombre_trabajador: afectado.nombre, puesto: afectado.puesto,
        causa_inmediata: 'Condición insegura detectada durante la ejecución de la tarea.',
        categoria_causa: pick(CAUSA, base + i),
        estado,
        investigador_dni: investigador.dni,
        fecha_cierre: estado === 'Cerrado' ? daysAgo(randInt(0, 15)) : null,
        reportado_por: afectado.dni, fecha_registro: fecha,
        creado_por: afectado.id, creado_por_dni: afectado.dni
      });
      for (let c = 0; c < 2; c++) {
        out.incidentes_acciones.push({
          empresa_id: emp.id, parent_uuid: uuid,
          accion: c === 0 ? 'Reforzar capacitación específica al personal involucrado' : 'Actualizar procedimiento y difundirlo en charla de 5 minutos',
          responsable: investigador.nombre,
          fecha_limite: monthsAfter(fecha, 1),
          estado_accion: estado === 'Cerrado' ? 'Cumplida' : 'Pendiente'
        });
      }
    }
  }

  // ── 06_Capacitaciones ── (Supervisor instruye/organiza, asistentes = trabajadores)
  if (emp.modulos['06_Capacitaciones']) {
    const TIPO = ['Inducción', 'Capacitación específica', 'Reentrenamiento', 'Charla de seguridad'];
    const MODALIDAD = ['Presencial', 'Virtual', 'Mixta'];
    for (let i = 0; i < 3; i++) {
      const instructor = pick(sups, base + i);
      const tema = pick(TEMAS_CHARLA, base + i);
      const uuid = nextId('CAP');
      const fecha = daysAgo(randInt(5, 100));
      const vigencia = pick(['12', '24', '36'], base + i);
      out.capacitaciones.push({
        empresa_id: emp.id, uuid,
        nombre_capacitacion: `Capacitación: ${tema}`,
        tipo: pick(TIPO, base + i), tema,
        modalidad: pick(MODALIDAD, base + i),
        fecha_ejecucion: fecha, duracion_horas: String(randInt(1, 4)),
        instructor: instructor.nombre,
        vigencia_meses: vigencia,
        fecha_vencimiento: monthsAfter(fecha, parseInt(vigencia, 10)),
        evaluacion: 'Sí', nota_minima: '14',
        estado: 'Ejecutada',
        registrado_por: instructor.nombre, fecha_registro: fecha,
        creado_por: instructor.id, creado_por_dni: instructor.dni
      });
      trabs.forEach((t, idx) => {
        const nota = randInt(11, 20);
        out.capacitaciones_asistentes.push({
          empresa_id: emp.id, parent_uuid: uuid,
          dni: t.dni, nombre: t.nombre, area_asis: t.area,
          nota: String(nota), resultado: nota >= 14 ? 'Aprobado' : 'Desaprobado'
        });
      });
    }
  }

  // ── 07_IPERC ── (Supervisor elabora/revisa)
  const ipercUuids = [];
  if (emp.modulos['07_IPERC']) {
    const TIPO = ['Línea base', 'Continuo', 'Específico'];
    const ESTADOS = ['Aprobado', 'En revisión', 'Borrador'];
    for (let i = 0; i < 3; i++) {
      const elaborador = pick(sups, base + i);
      const revisor = pick(sups, base + i + 1);
      const uuid = nextId('IPE');
      ipercUuids.push(uuid);
      const fecha = daysAgo(randInt(20, 200));
      const peligros = [];
      let maxNivel = 'Trivial';
      const NIVEL_ORDEN = ['Trivial', 'Tolerable', 'Moderado', 'Importante', 'Intolerable'];
      for (let c = 0; c < 3; c++) {
        const t = pick(HALLAZGOS, base + i + c);
        const prob = randInt(1, 4), sev = randInt(1, 4);
        const nivel = nivelRiesgo(prob, sev);
        if (NIVEL_ORDEN.indexOf(nivel) > NIVEL_ORDEN.indexOf(maxNivel)) maxNivel = nivel;
        peligros.push({ empresa_id: emp.id, parent_uuid: uuid, peligro: t.h, riesgo: t.r, probabilidad: String(prob), severidad: String(sev), nivel_riesgo: nivel, jerarquia: pick(IPERC_JERARQUIA, c), controles: t.rec });
      }
      out.iperc.push({
        empresa_id: emp.id, uuid,
        proceso: pick(IPERC_PROCESOS, base + i),
        tipo_iperc: pick(TIPO, base + i),
        area: pick(AREA_GENERAL, base + i),
        fecha_elaboracion: fecha, fecha_revision: monthsAfter(fecha, 12),
        elaborado_por: elaborador.dni, revisado_por: revisor.dni,
        estado: pick(ESTADOS, base + i),
        riesgo_maximo: maxNivel, total_peligros: String(peligros.length),
        registrado_por: elaborador.nombre, fecha_registro: fecha,
        creado_por: elaborador.id, creado_por_dni: elaborador.dni
      });
      out.iperc_peligros.push(...peligros);
    }
  }

  // ── 08_PETAR ── (Trabajador ejecuta, Supervisor supervisa/aprueba)
  if (emp.modulos['08_PETAR']) {
    const ESTADOS = ['Aprobado', 'En ejecución', 'Cerrado', 'Solicitado'];
    for (let i = 0; i < 3; i++) {
      const ejecutante = pick(trabs, base + i);
      const supervisor = pick(sups, base + i);
      const tipo = pick(PETAR_TIPOS, base + i);
      const estado = pick(ESTADOS, base + i);
      const uuid = nextId('PET');
      const fecha = daysAgo(randInt(1, 45));
      out.petar.push({
        empresa_id: emp.id, uuid,
        tipo_trabajo: tipo,
        descripcion: `Ejecución de trabajo: ${tipo.toLowerCase()} en ${pick(AREA_GENERAL, base + i)}.`,
        area: pick(AREA_GENERAL, base + i),
        fecha, hora_inicio: '08:00', hora_fin: '17:00',
        empresa: i % 3 === 0 ? 'Contratista externo autorizado' : 'Personal propio',
        ejecutante_dni: ejecutante.dni, num_trabajadores: String(randInt(1, 5)),
        supervisor_dni: supervisor.dni,
        iperc_referencia: ipercUuids.length ? pick(ipercUuids, base + i) : null,
        estado,
        aprobado_por: (estado === 'Aprobado' || estado === 'Cerrado' || estado === 'En ejecución') ? supervisor.dni : null,
        fecha_aprobacion: (estado === 'Aprobado' || estado === 'Cerrado') ? fecha : null,
        registrado_por: ejecutante.nombre, fecha_registro: fecha,
        creado_por: ejecutante.id, creado_por_dni: ejecutante.dni
      });
      const items = PETAR_CHECKLISTS[tipo];
      items.forEach((item, idx) => {
        out.petar_verificaciones.push({
          empresa_id: emp.id, parent_uuid: uuid, item,
          cumple: (idx === items.length - 1 && i % 3 === 1) ? 'No' : 'Sí',
          observacion: null
        });
      });
    }
  }

  // ── 09_EPP ── (Supervisor entrega, Trabajador recibe)
  if (emp.modulos['09_EPP']) {
    const TIPO_ENTREGA = ['Dotación inicial', 'Reposición por vida útil', 'Reposición por desgaste'];
    const ESTADOS = ['Entregado', 'Pendiente de firma'];
    for (let i = 0; i < 4; i++) {
      const receptor = pick(trabs, base + i);
      const entregador = pick(sups, base + i);
      const uuid = nextId('EPP');
      const fecha = daysAgo(randInt(1, 120));
      const items = [];
      for (let c = 0; c < 2; c++) {
        const equipo = pick(EPP_EQUIPOS, base + i + c);
        const vidaUtil = EPP_VIDA_UTIL[equipo];
        items.push({
          empresa_id: emp.id, parent_uuid: uuid, equipo,
          marca: pick(EPP_MARCAS, base + i + c), talla: pick(EPP_TALLAS, base + i + c),
          cantidad: randInt(1, 2), vida_util: vidaUtil,
          fecha_reposicion: vidaUtil !== '0' ? monthsAfter(fecha, parseInt(vidaUtil, 10)) : null
        });
      }
      out.epp.push({
        empresa_id: emp.id, uuid,
        trabajador_dni: receptor.dni, nombre_trabajador: receptor.nombre,
        area: pick(AREA_GENERAL, base + i), puesto: receptor.puesto,
        tipo_entrega: pick(TIPO_ENTREGA, base + i),
        fecha_entrega: fecha, entregado_por: entregador.dni,
        estado: pick(ESTADOS, base + i),
        total_items: String(items.length),
        proxima_reposicion: items[0].fecha_reposicion,
        registrado_por: entregador.nombre, fecha_registro: fecha,
        creado_por: entregador.id, creado_por_dni: entregador.dni
      });
      out.epp_items.push(...items);
    }
  }

  // ── 10_Charlas ── (Supervisor expone, asistentes = trabajadores)
  if (emp.modulos['10_Charlas']) {
    const TURNOS = ['Día', 'Tarde', 'Noche'];
    const CATEGORIAS = ['Riesgos del día', 'Orden y limpieza', 'Uso de EPP', 'Trabajo en altura', 'Emergencias'];
    for (let i = 0; i < 4; i++) {
      const expositor = pick(sups, base + i);
      const uuid = nextId('CHA');
      const fecha = daysAgo(randInt(0, 30));
      out.charlas.push({
        empresa_id: emp.id, uuid,
        tema: pick(TEMAS_CHARLA, base + i + 3),
        categoria: pick(CATEGORIAS, base + i),
        fecha, hora: '07:30', turno: pick(TURNOS, base + i),
        area: pick(AREA_GENERAL, base + i),
        expositor_dni: expositor.dni, expositor: expositor.nombre,
        duracion_min: '10',
        puntos_tratados: 'Se revisaron los riesgos propios de la tarea del día y las medidas de control vigentes.',
        compromisos: 'El equipo se compromete a reportar cualquier condición insegura de inmediato.',
        total_asistentes: String(trabs.length),
        estado: 'Ejecutada',
        registrado_por: expositor.nombre, fecha_registro: fecha,
        creado_por: expositor.id, creado_por_dni: expositor.dni
      });
      trabs.forEach(t => {
        out.charlas_asistentes.push({ empresa_id: emp.id, parent_uuid: uuid, dni: t.dni, nombre: t.nombre, area_asis: t.area });
      });
    }
  }

  return out;
}

// =========================================================================
// 5. Orquestación
// =========================================================================
async function main() {
  console.log(`Proyecto: ${SUPABASE_URL}${DRY_RUN ? '  [DRY_RUN — no se escribe nada]' : ''}`);

  console.log('\n1. Empresas');
  await upsertRows('empresas', EMPRESAS.map(e => ({
    id: e.id, nombre: e.nombre, ruc: e.ruc, plan: e.plan, modulos: e.modulos,
    activa: true, trial_hasta: e.trialHasta || null
  })), 'id');

  console.log('\n2. Usuarios (Auth + tabla usuarios)');
  const personas = buildPersonas();
  for (const p of personas) {
    p.id = await ensureAuthUser(p);
  }
  await upsertRows('usuarios', personas.map(p => ({
    id: p.id, empresa_id: p.empresa_id, dni: p.dni, nombre: p.nombre, email: p.email,
    rol: p.rol, area: p.area, puesto: p.puesto, status: 'Activo'
  })), 'id');
  console.log(`  -> ${personas.length} personas (1 SuperAdmin + 5 empresas x 7). Password demo: ${DEMO_PASSWORD}`);

  console.log('\n3. Datos por módulo (por empresa)');
  const acc = { reportes: [], reportes_child: [], inspecciones: [], inspecciones_child: [], actos_condiciones: [], incidentes: [], incidentes_acciones: [], capacitaciones: [], capacitaciones_asistentes: [], iperc: [], iperc_peligros: [], petar: [], petar_verificaciones: [], epp: [], epp_items: [], charlas: [], charlas_asistentes: [] };
  EMPRESAS.forEach(emp => {
    const personasEmp = personas.filter(p => p.empresa_id === emp.id);
    const data = buildEmpresaData(emp, personasEmp);
    Object.keys(acc).forEach(k => acc[k].push(...data[k]));
  });

  await upsertRows('reportes', acc.reportes, 'uuid');
  await upsertRows('reportes_child', acc.reportes_child, 'empresa_id,parent_uuid,observacion');
  await upsertRows('inspecciones', acc.inspecciones, 'uuid');
  await upsertRows('inspecciones_child', acc.inspecciones_child, 'empresa_id,parent_uuid,hallazgo');
  await upsertRows('actos_condiciones', acc.actos_condiciones, 'uuid');
  await upsertRows('incidentes', acc.incidentes, 'uuid');
  await upsertRows('incidentes_acciones', acc.incidentes_acciones, 'empresa_id,parent_uuid,accion');
  await upsertRows('capacitaciones', acc.capacitaciones, 'uuid');
  await upsertRows('capacitaciones_asistentes', acc.capacitaciones_asistentes, 'empresa_id,parent_uuid,dni');
  await upsertRows('iperc', acc.iperc, 'uuid');
  await upsertRows('iperc_peligros', acc.iperc_peligros, 'empresa_id,parent_uuid,peligro');
  await upsertRows('petar', acc.petar, 'uuid');
  await upsertRows('petar_verificaciones', acc.petar_verificaciones, 'empresa_id,parent_uuid,item');
  await upsertRows('epp', acc.epp, 'uuid');
  await upsertRows('epp_items', acc.epp_items, 'empresa_id,parent_uuid,equipo');
  await upsertRows('charlas', acc.charlas, 'uuid');
  await upsertRows('charlas_asistentes', acc.charlas_asistentes, 'empresa_id,parent_uuid,dni');

  console.log('\nListo.');
  if (!DRY_RUN) {
    console.log(`Inicia sesión con cualquiera de los ${personas.length} correos generados y la contraseña "${DEMO_PASSWORD}".`);
  }
}

main().catch(err => {
  console.error('\nError durante el seed:', err.message);
  console.error('Si el error menciona "relation ... does not exist", falta ejecutar antes tools/supabase_01_schema.sql (y 02_rls.sql) en el editor SQL de Supabase.');
  process.exit(1);
});
