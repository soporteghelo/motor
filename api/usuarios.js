/**
 * POST /api/usuarios — gestión de cuentas (función serverless de Vercel)
 * =========================================================================
 * Crear una cuenta real de Supabase Auth o cambiar su contraseña exige la
 * service_role key, que NUNCA debe llegar al navegador. Esta función la usa
 * en el servidor y solo después de comprobar que quien llama es Admin (de su
 * empresa) o SuperAdmin.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL                https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   Settings → API → service_role   (secreta)
 *
 * Cuerpo:
 *   { accion: 'crear', id?, dni, nombre, email?, password, rol, status?,
 *     area?, puesto?, foto_perfil?, firma_cargo?, empresa_id? (solo SuperAdmin) }
 *   { accion: 'password', id, password }
 *   { accion: 'perfil', id, email?, dni? }   cambia la llave del login en
 *                                            Auth y en el perfil a la vez
 *
 * Cabecera: Authorization: Bearer <JWT de la sesión de quien llama>
 * =========================================================================
 */
const SB_URL  = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ROLES_ASIGNABLES = ['admin', 'supervisor', 'trabajador'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function enviar(res, codigo, cuerpo) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

async function sb(ruta, opciones = {}) {
  const res = await fetch(SB_URL + ruta, {
    ...opciones,
    headers: {
      apikey: SERVICE,
      Authorization: 'Bearer ' + SERVICE,
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    }
  });
  const texto = await res.text();
  let body = null;
  try { body = texto ? JSON.parse(texto) : null; } catch (e) { body = texto; }
  return { ok: res.ok, status: res.status, body };
}

// Mínimo razonable para cuentas con acceso a datos de salud y seguridad
// laboral: 8+ caracteres con al menos una letra y un número.
function passwordInvalida(p) {
  p = String(p || '');
  if (p.length < 8)  return 'La contraseña debe tener al menos 8 caracteres.';
  if (p.length > 72) return 'La contraseña no puede superar 72 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'La contraseña debe combinar letras y números.';
  return '';
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_RE   = /^[0-9A-Za-z-]{6,15}$/;

const msgDe = (r, def) => (r.body && (r.body.msg || r.body.message || r.body.error_description || r.body.error)) || def;
const bloqueado = s => ['cesado', 'inactivo'].indexOf(String(s || '').toLowerCase()) !== -1;

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } }
  const trozos = [];
  for await (const t of req) trozos.push(t);
  try { return JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}'); } catch (e) { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return enviar(res, 405, { msg: 'Método no permitido.' });
  if (!SB_URL || !SERVICE) {
    return enviar(res, 500, { msg: 'Servidor sin configurar: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
  }

  // ── 1. ¿Quién llama? (se valida el JWT contra Supabase Auth) ─────────────
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return enviar(res, 401, { msg: 'Sesión requerida.' });
  const yo = await sb('/auth/v1/user', { headers: { Authorization: 'Bearer ' + token } });
  if (!yo.ok || !yo.body || !yo.body.id) return enviar(res, 401, { msg: 'Sesión inválida o expirada.' });

  const perfilRes = await sb('/rest/v1/usuarios?id=eq.' + encodeURIComponent(yo.body.id) + '&select=id,rol,empresa_id,status');
  const perfil = Array.isArray(perfilRes.body) ? perfilRes.body[0] : null;
  if (!perfil || ['admin', 'superadmin'].indexOf(perfil.rol) === -1 || bloqueado(perfil.status)) {
    return enviar(res, 403, { msg: 'Solo un administrador activo puede gestionar cuentas.' });
  }
  const esSuper = perfil.rol === 'superadmin';

  const b = await leerCuerpo(req);

  // ── 2a. Cambiar contraseña ───────────────────────────────────────────────
  if (b.accion === 'password') {
    if (!UUID_RE.test(String(b.id || ''))) return enviar(res, 400, { msg: 'Usuario inválido.' });
    const errPass = passwordInvalida(b.password);
    if (errPass) return enviar(res, 400, { msg: errPass });
    const tRes = await sb('/rest/v1/usuarios?id=eq.' + b.id + '&select=id,empresa_id,rol');
    const objetivo = Array.isArray(tRes.body) ? tRes.body[0] : null;
    if (!objetivo) return enviar(res, 404, { msg: 'Usuario no encontrado.' });
    if (!esSuper && (objetivo.empresa_id !== perfil.empresa_id || objetivo.rol === 'superadmin')) {
      return enviar(res, 403, { msg: 'No puedes modificar cuentas de otra empresa.' });
    }
    // Un Admin cambiando la contraseña de OTRO Admin podría tomar su cuenta.
    // Entre administradores la restablece el proveedor del servicio.
    if (!esSuper && objetivo.rol === 'admin' && objetivo.id !== perfil.id) {
      return enviar(res, 403, { msg: 'La contraseña de otro administrador solo la restablece el proveedor del servicio.' });
    }
    const r = await sb('/auth/v1/admin/users/' + b.id, { method: 'PUT', body: JSON.stringify({ password: b.password }) });
    if (!r.ok) return enviar(res, r.status, { msg: msgDe(r, 'No se pudo cambiar la contraseña.') });
    return enviar(res, 200, { uuid: b.id });
  }

  // ── 2b. Cambiar DNI o email (la llave del login) ─────────────────────────
  // La tabla usuarios no deja cambiarlos directamente (trigger
  // proteger_usuarios): cambiarlos solo en el perfil dejaba sin login.
  if (b.accion === 'perfil') {
    if (!UUID_RE.test(String(b.id || ''))) return enviar(res, 400, { msg: 'Usuario inválido.' });
    const tRes = await sb('/rest/v1/usuarios?id=eq.' + b.id + '&select=id,empresa_id,rol,dni,email');
    const objetivo = Array.isArray(tRes.body) ? tRes.body[0] : null;
    if (!objetivo) return enviar(res, 404, { msg: 'Usuario no encontrado.' });
    if (!esSuper && (objetivo.empresa_id !== perfil.empresa_id || objetivo.rol === 'superadmin')) {
      return enviar(res, 403, { msg: 'No puedes modificar cuentas de otra empresa.' });
    }
    if (!esSuper && objetivo.rol === 'admin' && objetivo.id !== perfil.id) {
      return enviar(res, 403, { msg: 'Los datos de acceso de otro administrador solo los cambia el proveedor del servicio.' });
    }

    const cambiosAuth = {}, cambiosPerfil = {};
    if (b.email !== undefined) {
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return enviar(res, 400, { msg: 'Correo inválido.' });
      if (email !== String(objetivo.email || '').toLowerCase()) {
        cambiosAuth.email = email; cambiosAuth.email_confirm = true; cambiosPerfil.email = email;
      }
    }
    if (b.dni !== undefined) {
      const dni = String(b.dni || '').trim();
      if (!DNI_RE.test(dni)) return enviar(res, 400, { msg: 'DNI inválido (6 a 15 caracteres, sin espacios).' });
      if (dni !== objetivo.dni) {
        const dup = await sb('/rest/v1/usuarios?dni=eq.' + encodeURIComponent(dni) + '&select=id');
        if (Array.isArray(dup.body) && dup.body.length) return enviar(res, 409, { msg: 'Ya existe una cuenta con el DNI ' + dni + '.' });
        cambiosPerfil.dni = dni;
        // app_metadata.dni también lo copia el trigger sync_claims_usuario
        cambiosAuth.app_metadata = { dni };
        cambiosAuth.user_metadata = { dni };
      }
    }
    if (!Object.keys(cambiosPerfil).length) return enviar(res, 200, { uuid: objetivo.id });

    const ra = await sb('/auth/v1/admin/users/' + objetivo.id, { method: 'PUT', body: JSON.stringify(cambiosAuth) });
    if (!ra.ok) return enviar(res, ra.status === 422 ? 409 : (ra.status || 500), { msg: msgDe(ra, 'No se pudo actualizar la cuenta.') });
    const rp = await sb('/rest/v1/usuarios?id=eq.' + objetivo.id, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cambiosPerfil)
    });
    if (!rp.ok) {
      // Se deshace el cambio en Auth: login y perfil no deben quedar desalineados
      const revertir = {};
      if (cambiosAuth.email) revertir.email = objetivo.email;
      if (cambiosAuth.app_metadata) { revertir.app_metadata = { dni: objetivo.dni }; revertir.user_metadata = { dni: objetivo.dni }; }
      await sb('/auth/v1/admin/users/' + objetivo.id, { method: 'PUT', body: JSON.stringify(revertir) });
      return enviar(res, rp.status || 500, { msg: msgDe(rp, 'No se pudo actualizar el perfil.') });
    }
    return enviar(res, 200, { uuid: objetivo.id });
  }

  if (b.accion !== 'crear') return enviar(res, 400, { msg: 'Acción desconocida.' });

  // ── 2c. Crear cuenta ─────────────────────────────────────────────────────
  const dni    = String(b.dni || '').trim();
  const nombre = String(b.nombre || '').trim();
  const rol    = String(b.rol || 'trabajador').toLowerCase();
  const pass   = String(b.password || '');
  const empresa = esSuper && b.empresa_id ? String(b.empresa_id) : perfil.empresa_id;

  if (!DNI_RE.test(dni)) return enviar(res, 400, { msg: 'DNI inválido (6 a 15 caracteres, sin espacios).' });
  if (!nombre) return enviar(res, 400, { msg: 'El nombre es obligatorio.' });
  const errPass = passwordInvalida(pass);
  if (errPass) return enviar(res, 400, { msg: errPass });
  if (ROLES_ASIGNABLES.indexOf(rol) === -1) return enviar(res, 400, { msg: 'Rol no permitido: ' + rol });
  if (!empresa) return enviar(res, 400, { msg: 'Tu cuenta no está asociada a una empresa.' });

  // El login resuelve DNI → email con una sola búsqueda (login_email_de_dni),
  // así que el DNI debe ser único en toda la plataforma, no solo en la empresa.
  const dup = await sb('/rest/v1/usuarios?dni=eq.' + encodeURIComponent(dni) + '&select=id');
  if (Array.isArray(dup.body) && dup.body.length) return enviar(res, 409, { msg: 'Ya existe una cuenta con el DNI ' + dni + '.' });

  // Supabase Auth exige email. Si el trabajador no tiene, se usa uno técnico
  // en un dominio reservado (.invalid, RFC 2606): nunca recibe correo.
  const emailReal = String(b.email || '').trim().toLowerCase();
  const email = EMAIL_RE.test(emailReal) ? emailReal : (dni.toLowerCase() + '@sin-correo.invalid');

  const altaAuth = {
    email, password: pass, email_confirm: true,
    app_metadata: { rol, empresa_id: empresa, dni },
    user_metadata: { nombre, dni }
  };
  if (UUID_RE.test(String(b.id || ''))) altaAuth.id = b.id;

  const creado = await sb('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(altaAuth) });
  if (!creado.ok || !creado.body || !creado.body.id) {
    return enviar(res, creado.status === 422 ? 409 : (creado.status || 500), { msg: msgDe(creado, 'No se pudo crear la cuenta.') });
  }
  const id = creado.body.id;

  const fila = {
    id, empresa_id: empresa, dni, nombre, email, rol,
    status: b.status === 'Cesado' ? 'Cesado' : 'Activo',
    area: b.area || null, puesto: b.puesto || null,
    foto_perfil: b.foto_perfil || null, firma_cargo: b.firma_cargo || null
  };
  let ins = await sb('/rest/v1/usuarios', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fila) });
  if (!ins.ok && /foto_perfil|firma_cargo/.test(msgDe(ins, ''))) {
    // Base sin supabase_07 todavía: se crea el perfil sin foto/firma
    delete fila.foto_perfil; delete fila.firma_cargo;
    ins = await sb('/rest/v1/usuarios', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fila) });
  }
  if (!ins.ok) {
    // Sin perfil la cuenta quedaría huérfana (puede autenticarse pero no ve nada)
    await sb('/auth/v1/admin/users/' + id, { method: 'DELETE' });
    return enviar(res, ins.status || 500, { msg: msgDe(ins, 'No se pudo registrar el perfil.') });
  }
  return enviar(res, 201, { uuid: id, email });
};
