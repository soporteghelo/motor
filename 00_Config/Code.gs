  /**
  * =========================================================================
  *  MOTOR PWA SSOMA · Backend Google Apps Script (Sheets + Drive)
  *  ARCHIVO ÚNICO — pega este archivo completo como Code.gs
  * =========================================================================
  *
  *  PUESTA EN MARCHA (una sola vez)
  *   1. Completa CONFIG (abajo): la carpeta raíz de Drive y, si ya la tienes,
  *      la Google Sheet. Puedes pegar el ID o la URL completa.
  *   2. Menú "Ejecutar" → _CrearProyecto. Acepta los permisos que pide Google.
  *      Crea las pestañas con sus encabezados, la carpeta DATA con una
  *      subcarpeta por módulo y el primer administrador.
  *   3. Implementar → Nueva implementación → tipo "Aplicación web":
  *        Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
  *      (la seguridad la pone el login de la app, no Google)
  *   4. Ejecuta _VerificarProyecto: revisa la estructura, prueba la escritura
  *      en Drive, comprueba que la aplicación web responde y te muestra la URL.
  *   5. Pon esa URL (/exec) en la app:
  *        Vercel → variable APPS_SCRIPT_URL  (y DB_PROVIDER = appscript)
  *        o Global_Config.js.html → AppsScript.URL
  *      Si la app se sirve desde este mismo proyecto (archivo Index.html), no
  *      hace falta URL: usa google.script.run.
  *
  *  ESTRUCTURA EN DRIVE
  *   <Carpeta raíz>/
  *     ├── <Google Sheet del proyecto>   una pestaña por módulo, sus tablas de
  *     │                                 detalle, _CONFIG y _AUDITORIA
  *     └── DATA/
  *          ├── 01_Usuarios/2026/11/20/…  fotos y firmas del personal
  *          ├── 05_Incidentes/2026/11/20/…
  *          └── …                         (subcarpetas automáticas por fecha)
  *
  *  ESQUEMA
  *   El bloque ESQUEMA lo genera `node tools/gen_appscript.js` a partir de los
  *   subconfigs de la app (la misma fuente que usa Supabase). Si agregas un
  *   módulo o un campo: regenera, vuelve a pegar este archivo y ejecuta
  *   _CrearProyecto (añade lo que falte; nunca borra columnas ni datos).
  * =========================================================================
  */

  // ⚙️ =======================================================================
  // ⚙️  CONFIGURACIÓN — lo único que se edita a mano
  // ⚙️ =======================================================================
  const CONFIG = {
    // ── OBLIGATORIO ──────────────────────────────────────────────────────────
    // Carpeta de Drive donde vive todo el proyecto (ID o URL de la carpeta).
    ROOT_FOLDER_ID: '1Rbi8UjuP4UR-nMehyQxxm0RRFhvnKQ4m',

    // Google Sheet de la base de datos (ID o URL). Vacío = _CrearProyecto crea
    // una nueva dentro de la carpeta raíz y recuerda su ID. Si indicas una que
    // está en otra carpeta, se mueve a la carpeta raíz.
    SPREADSHEET_ID: '1OpWbxkp_UUsFj3APQvunOtRxzAH4kVisMOugwKxb6Ks',

    // ── PRIMER ADMINISTRADOR ─────────────────────────────────────────────────
    // Solo se crea si la pestaña de usuarios está vacía. Entra con este DNI y
    // esta contraseña y cámbiala desde Usuarios.
    ADMIN_INICIAL: { DNI: '00000000', NOMBRE: 'Administrador del sistema', EMAIL: '', PASSWORD: 'Cambiar2026' },

    // ── ARCHIVOS ─────────────────────────────────────────────────────────────
    DATA_FOLDER_NAME: 'DATA',
    // Subcarpetas automáticas por fecha dentro de cada módulo. Cada "/" es un
    // nivel; los códigos son los de Utilities.formatDate (yyyy, MM, dd, …).
    //   'yyyy/MM/dd' → 2026/11/20     'yyyy-MM' → 2026-11     '' → sin subcarpetas
    DATE_FOLDER_PATTERN: 'yyyy/MM/dd',
    MAX_FILE_MB: 10,

    // ── SESIÓN Y EMPRESA ─────────────────────────────────────────────────────
    SESSION_HOURS: 6,              // inactividad máxima (tope técnico: 6 h)
    TIMEZONE: 'America/Lima',
    EMPRESA_NOMBRE: 'Mi Empresa S.A.C.',
    SPREADSHEET_NAME: 'MOTOR SSOMA · Base de datos',
    APP_VERSION: '2.0.0'
  };


  // =========================================================================
  //  ESQUEMA DE DATOS — GENERADO. No editar a mano: node tools/gen_appscript.js
  // =========================================================================
  // <<<ESQUEMA-INICIO>>>
const ESQUEMA = {
  "version": "65a60962e2",
  "usuarios": {
    "id": "01_Usuarios",
    "hoja": "01_Usuarios",
    "campos": ["UUID","DNI","Nombre_Completo","Email","Password_Hash","Rol","Status","Empresa","Foto_Perfil","Foto_Perfil_ID","Foto_Perfil_Path","Firma_Cargo","Firma_Cargo_ID","Firma_Cargo_Path","Consentimiento_Fecha","Consentimiento_Folio","Consentimiento_Path","Area","Puesto","Creado_En","Actualizado_En","Ultimo_Acceso"],
    "archivos": ["Foto_Perfil","Firma_Cargo"],
    "tipos": {"Foto_Perfil":"Image","Firma_Cargo":"Signature"},
    "clases": {
      "Password_Hash": "opaco",
      "Rol": "enum",
      "Status": "enum",
      "Empresa": "enum",
      "Foto_Perfil": "opaco",
      "Firma_Cargo": "opaco"
    }
  },
  "modulos": {
    "02_Reportes": {
      "hoja": "02_Reportes",
      "hojaHija": "02_Reportes__CHILD",
      "campos": ["UUID","Fecha_Emision","Inspector_DNI","Categoria_Reporte","Nivel_Severidad","Evidencia_Fotografica","Evidencia_Fotografica_ID","Evidencia_Fotografica_Path","Firma_Operario","Firma_Operario_ID","Firma_Operario_Path","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["Observacion"],
      "archivos": ["Evidencia_Fotografica","Firma_Operario"],
      "tipos": {"Evidencia_Fotografica":"Image","Firma_Operario":"Signature"},
      "clases": {
        "Fecha_Emision": "date",
        "Categoria_Reporte": "enum",
        "Nivel_Severidad": "enum",
        "Evidencia_Fotografica": "opaco",
        "Firma_Operario": "opaco"
      },
      "responsables": [],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "03_Inspecciones": {
      "hoja": "03_Inspecciones",
      "hojaHija": "03_Inspecciones__CHILD",
      "campos": ["UUID","Fecha_Peru","Auditor_DNI","Area_Inspeccion","Tipo_Hallazgo","Descripcion_Tecnica","Estado_Actual","Responsable","Plazo","Evidencia_Fotos","Evidencia_Fotos_ID","Evidencia_Fotos_Path","Firma_Digital","Firma_Digital_ID","Firma_Digital_Path","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["Hallazgo","Riesgo","Recomendacion"],
      "archivos": ["Evidencia_Fotos","Firma_Digital"],
      "tipos": {"Evidencia_Fotos":"Image_Collection","Firma_Digital":"Signature"},
      "clases": {
        "Fecha_Peru": "date",
        "Area_Inspeccion": "enum",
        "Tipo_Hallazgo": "enum",
        "Estado_Actual": "enum",
        "Plazo": "date",
        "Evidencia_Fotos": "opaco",
        "Firma_Digital": "opaco"
      },
      "responsables": ["Auditor_DNI"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "04_Actos_Condiciones": {
      "hoja": "04_Actos_Condiciones",
      "hojaHija": "",
      "campos": ["UUID","Fecha_Reporte","Fecha_Incidente","Reportado_Por","Nombre_Reportante","Area","Tipo_Reporte","Categoria","Nivel_Riesgo","Descripcion","Evidencia_Foto","Evidencia_Foto_ID","Evidencia_Foto_Path","Estado","Moderado_Por","Fecha_Moderacion","Accion_Correctiva","Observaciones_Mod","Fuente","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": [],
      "archivos": ["Evidencia_Foto"],
      "tipos": {"Evidencia_Foto":"Image"},
      "clases": {
        "Fecha_Reporte": "date",
        "Fecha_Incidente": "date",
        "Area": "enum",
        "Tipo_Reporte": "enum",
        "Categoria": "enum",
        "Nivel_Riesgo": "enum",
        "Evidencia_Foto": "opaco",
        "Estado": "enum",
        "Fecha_Moderacion": "date",
        "Fuente": "enum",
        "Fecha_Registro": "date"
      },
      "responsables": ["Reportado_Por","Moderado_Por"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "05_Incidentes": {
      "hoja": "05_Incidentes",
      "hojaHija": "05_Incidentes__ACCIONES",
      "campos": ["UUID","Fecha_Evento","Hora_Evento","Tipo_Evento","Gravedad","Severidad_Potencial","Area","Lugar_Exacto","Descripcion","Trabajador_DNI","Nombre_Trabajador","Puesto","Parte_Afectada","Dias_Descanso","Testigos","Tipo_Personal","Acciones_Inmediatas","Equipo_Involucrado","Costo_Estimado_Danos","Requiere_Notificacion_Autoridad","Notificados","Causa_Inmediata","Causa_Basica","Categoria_Causa","Estado","Investigador_DNI","Fecha_Cierre","Evidencia_Fotos","Evidencia_Fotos_ID","Evidencia_Fotos_Path","Firma_Investigador","Firma_Investigador_ID","Firma_Investigador_Path","Reportado_Por","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["Accion","Responsable","Fecha_Limite","Estado_Accion"],
      "archivos": ["Evidencia_Fotos","Firma_Investigador"],
      "tipos": {"Evidencia_Fotos":"Image_Collection","Firma_Investigador":"Signature"},
      "clases": {
        "Fecha_Evento": "date",
        "Tipo_Evento": "enum",
        "Gravedad": "enum",
        "Severidad_Potencial": "enum",
        "Area": "enum",
        "Parte_Afectada": "enum",
        "Tipo_Personal": "enum",
        "Requiere_Notificacion_Autoridad": "enum",
        "Categoria_Causa": "enum",
        "Estado": "enum",
        "Fecha_Cierre": "date",
        "Evidencia_Fotos": "opaco",
        "Firma_Investigador": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": ["Trabajador_DNI","Reportado_Por"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "06_Capacitaciones": {
      "hoja": "06_Capacitaciones",
      "hojaHija": "06_Capacitaciones__ASISTENTES",
      "campos": ["UUID","Nombre_Capacitacion","Tipo","Tema","Modalidad","Fecha_Ejecucion","Duracion_Horas","Instructor","Entidad","Lugar","Vigencia_Meses","Fecha_Vencimiento","Evaluacion","Nota_Minima","Estado","Observaciones","Registro_Firmas","Registro_Firmas_ID","Registro_Firmas_Path","Material","Material_ID","Material_Path","Registrado_Por","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["DNI","Nombre","Area_Asis","Nota","Resultado"],
      "archivos": ["Registro_Firmas","Material"],
      "tipos": {"Registro_Firmas":"Image_Collection","Material":"File"},
      "clases": {
        "Tipo": "enum",
        "Tema": "enum",
        "Modalidad": "enum",
        "Fecha_Ejecucion": "date",
        "Vigencia_Meses": "enum",
        "Fecha_Vencimiento": "date",
        "Evaluacion": "enum",
        "Estado": "enum",
        "Registro_Firmas": "opaco",
        "Material": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": [],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":false,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "07_IPERC": {
      "hoja": "07_IPERC",
      "hojaHija": "07_IPERC__PELIGROS",
      "campos": ["UUID","Proceso","Tipo_IPERC","Area","Puesto_Tarea","Fecha_Elaboracion","Fecha_Revision","Elaborado_Por","Revisado_Por","Participantes","Estado","Riesgo_Maximo","Total_Peligros","Observaciones","Firma_Responsable","Firma_Responsable_ID","Firma_Responsable_Path","Registrado_Por","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["Peligro","Riesgo","Probabilidad","Severidad","Nivel_Riesgo","Jerarquia","Controles"],
      "archivos": ["Firma_Responsable"],
      "tipos": {"Firma_Responsable":"Signature"},
      "clases": {
        "Tipo_IPERC": "enum",
        "Area": "enum",
        "Fecha_Elaboracion": "date",
        "Fecha_Revision": "date",
        "Estado": "enum",
        "Riesgo_Maximo": "enum",
        "Firma_Responsable": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": ["Elaborado_Por","Revisado_Por"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":false,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "08_PETAR": {
      "hoja": "08_PETAR",
      "hojaHija": "08_PETAR__VERIFICACIONES",
      "campos": ["UUID","Tipo_Trabajo","Descripcion","Area","Lugar_Especifico","Fecha","Hora_Inicio","Hora_Fin","Empresa","Ejecutante_DNI","Num_Trabajadores","Supervisor_DNI","IPERC_Referencia","Estado","Aprobado_Por","Fecha_Aprobacion","Hora_Cierre","Observaciones","Controles_No_Cumple","Total_Controles","Firma_Solicitante","Firma_Solicitante_ID","Firma_Solicitante_Path","Firma_Aprobador","Firma_Aprobador_ID","Firma_Aprobador_Path","Registrado_Por","Fecha_Registro","Empresa_Registro","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa_Registro",
      "camposHijo": ["Item","Cumple","Observacion"],
      "archivos": ["Firma_Solicitante","Firma_Aprobador"],
      "tipos": {"Firma_Solicitante":"Signature","Firma_Aprobador":"Signature"},
      "clases": {
        "Tipo_Trabajo": "enum",
        "Area": "enum",
        "Fecha": "date",
        "Estado": "enum",
        "Fecha_Aprobacion": "date",
        "Firma_Solicitante": "opaco",
        "Firma_Aprobador": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": ["Ejecutante_DNI","Supervisor_DNI","Aprobado_Por"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": true
    },
    "09_EPP": {
      "hoja": "09_EPP",
      "hojaHija": "09_EPP__ITEMS",
      "campos": ["UUID","Trabajador_DNI","Nombre_Trabajador","Area","Puesto","Tipo_Entrega","Fecha_Entrega","Entregado_Por","Estado","Observaciones","Total_Items","Proxima_Reposicion","Firma_Trabajador","Firma_Trabajador_ID","Firma_Trabajador_Path","Foto_Cargo","Foto_Cargo_ID","Foto_Cargo_Path","Registrado_Por","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["Equipo","Marca","Talla","Cantidad","Vida_Util","Fecha_Reposicion"],
      "archivos": ["Firma_Trabajador","Foto_Cargo"],
      "tipos": {"Firma_Trabajador":"Signature","Foto_Cargo":"Image_Collection"},
      "clases": {
        "Area": "enum",
        "Tipo_Entrega": "enum",
        "Fecha_Entrega": "date",
        "Estado": "enum",
        "Proxima_Reposicion": "date",
        "Firma_Trabajador": "opaco",
        "Foto_Cargo": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": ["Trabajador_DNI","Entregado_Por"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":false,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    },
    "10_Charlas": {
      "hoja": "10_Charlas",
      "hojaHija": "10_Charlas__ASISTENTES",
      "campos": ["UUID","Tema","Categoria","Fecha","Hora","Turno","Area","Lugar","Expositor_DNI","Expositor","Duracion_Min","Puntos_Tratados","Compromisos","Total_Asistentes","Estado","Firma_Expositor","Firma_Expositor_ID","Firma_Expositor_Path","Foto_Charla","Foto_Charla_ID","Foto_Charla_Path","Registrado_Por","Fecha_Registro","Empresa","Creado_Por_DNI","Creado_En","Actualizado_En"],
      "columnaEmpresa": "Empresa",
      "camposHijo": ["DNI","Nombre","Area_Asis"],
      "archivos": ["Firma_Expositor","Foto_Charla"],
      "tipos": {"Firma_Expositor":"Signature","Foto_Charla":"Image_Collection"},
      "clases": {
        "Categoria": "enum",
        "Fecha": "date",
        "Turno": "enum",
        "Area": "enum",
        "Estado": "enum",
        "Firma_Expositor": "opaco",
        "Foto_Charla": "opaco",
        "Fecha_Registro": "date"
      },
      "responsables": ["Expositor_DNI"],
      "roles": {
        "admin": {"crear":true,"leer":true,"editar":true,"eliminar":true,"alcance":"todos"},
        "supervisor": {"crear":true,"leer":true,"editar":true,"eliminar":false,"alcance":"responsable"},
        "trabajador": {"crear":true,"leer":true,"editar":false,"eliminar":false,"alcance":"propios"}
      },
      "emailTemplateId": "",
      "validarAprobacion": false
    }
  }
};
  // <<<ESQUEMA-FIN>>>


  // =========================================================================
  //  1. PUNTOS DE ENTRADA PÚBLICOS
  // =========================================================================

  /**
  * GET: si el proyecto incluye Index.html, sirve la app. Si no (la app vive en
  * Vercel), responde el estado del backend en JSON (útil para probar la URL
  * en el navegador: debe mostrar "status":"OK").
  */
  function doGet(e) {
    const p = (e && e.parameter) || {};
    if (!p.accion && !p.api) {
      try {
        const tpl = HtmlService.createTemplateFromFile('Index');
        tpl.scriptUrl = ScriptApp.getService().getUrl();
        return tpl.evaluate()
          .setTitle(CONFIG.SPREADSHEET_NAME.replace(/ · .*/, ''))
          .addMetaTag('viewport', 'width=device-width, initial-scale=1')
          // DEFAULT: ningún sitio de terceros puede incrustar la app (clickjacking)
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
      } catch (err) { /* sin Index.html: solo API */ }
    }
    return respuestaJson_(accPing_());
  }

  /** POST: API JSON que usa la app alojada fuera de Apps Script (Vercel). */
  function doPost(e) {
    const cuerpo = (e && e.postData && e.postData.contents) || '{}';
    return ContentService.createTextOutput(serverRouter(cuerpo)).setMimeType(ContentService.MimeType.JSON);
  }

  /** Puerta única: la usan google.script.run (app servida aquí) y doPost. */
  function serverRouter(requestString) {
    const t0 = Date.now();
    // Cada petición parte de cero: nada leído en otra ejecución se reutiliza
    Object.keys(_MEMO).forEach(k => { delete _MEMO[k]; });
    let req;
    try { req = (typeof requestString === 'string') ? JSON.parse(requestString || '{}') : (requestString || {}); }
    catch (e) { return JSON.stringify({ status: 'ERROR', msg: 'Petición inválida (no es JSON).' }); }
    return JSON.stringify(atender_(req, t0));
  }

  /** Para los <?!= include('…') ?> de Index.html cuando la app se sirve aquí. */
  function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  }

  /**
  * ▶ EJECUTAR UNA VEZ desde el editor. Crea (o completa) la estructura del
  * proyecto: Sheet, pestañas y encabezados, carpetas DATA/<módulo> y el primer
  * administrador. Es seguro ejecutarla varias veces: solo añade lo que falta.
  */
  function _CrearProyecto() {
    soloPropietario_();
    const rep = crearProyecto_();
    const texto = rep.lineas.join('\n');
    Logger.log(texto);
    avisarEnUi_('MOTOR · Proyecto creado', texto);
    return rep;
  }

  /**
  * ▶ Diagnóstico completo desde el editor: configuración, pestañas y
  * encabezados, carpetas, permiso de escritura en Drive, usuarios y la
  * conectividad de la aplicación web (la URL que debe usar la app).
  */
  function _VerificarProyecto() {
    soloPropietario_();
    const checks = verificarEstructura_({ escritura: true, red: true });
    const icono = { ok: '✅', warn: '⚠️', error: '❌' };
    const lineas = checks.map(c => icono[c.estado] + ' ' + c.nombre + (c.detalle ? ' — ' + c.detalle : ''));
    const errores = checks.filter(c => c.estado === 'error').length;
    const avisos = checks.filter(c => c.estado === 'warn').length;
    lineas.push('', errores ? '❌ ' + errores + ' error(es), ' + avisos + ' aviso(s). Corrige y vuelve a ejecutar.'
                            : (avisos ? '⚠️ Funciona, con ' + avisos + ' aviso(s).' : '✅ Todo en orden: la app puede conectarse.'));
    const texto = lineas.join('\n');
    Logger.log(texto);
    avisarEnUi_('MOTOR · Verificación', texto);
    return { ok: errores === 0, checks };
  }


  // =========================================================================
  //  2. ENRUTADOR
  // =========================================================================
  // publica: no requiere sesión · escritura: se serializa con LockService
  const ACCIONES = {
    PING:               { publica: true,  fn: (req) => accPing_(req) },
    LOGIN_AUTH:         { publica: true,  fn: (req) => accLogin_(req) },
    LOGOUT:             { fn: (req, s) => accLogout_(req, s) },
    READ_DB:            { fn: (req, s) => accLeer_(req, s) },
    QUERY_DB:           { fn: (req, s) => accConsultar_(req, s) },
    COUNT_DB:           { fn: (req, s) => accContar_(req, s) },
    AGG_DB:             { fn: (req, s) => accAgregar_(req, s) },
    AGG_BATCH:          { fn: (req, s) => accAgregarLote_(req, s) },
    READ_DELTA:         { fn: (req, s) => accDelta_(req, s) },
    READ_CHILDREN:      { fn: (req, s) => accHijos_(req, s) },
    GET_FILES:          { fn: (req, s) => accArchivos_(req, s) },
    SYNC_OFFLINE_QUEUE: { escritura: true, fn: (req, s) => accSync_(req, s) },
    DELETE_ROWS:        { escritura: true, fn: (req, s) => accEliminar_(req, s) },
    SAVE_CONFIG:        { escritura: true, fn: (req, s) => accGuardarConfig_(req, s) },
    CREATE_USER:        { escritura: true, fn: (req, s) => accCrearUsuario_(req, s) },
    CHANGE_PASSWORD:    { escritura: true, fn: (req, s) => accCambiarPassword_(req, s) },
  SAVE_CONSENT:       { escritura: true, fn: (req, s) => accGuardarConsentimiento_(req, s) },
    VERIFICAR_PROYECTO: { fn: (req, s) => accVerificar_(req, s) }
  };

  function atender_(req, t0) {
    const def = ACCIONES[req && req.action];
    if (!def) return { status: 'ERROR', msg: 'Acción no reconocida: ' + (req && req.action) };
    let lock = null;
    try {
      let sesion = null;
      if (!def.publica) {
        sesion = leerSesion_(req.userToken);
        if (!sesion) return { status: 'INVALID_TOKEN', msg: 'Tu sesión expiró. Vuelve a iniciar sesión.', transitorio: true };
        if (sesion.bloqueado) {
          cerrarSesion_(req.userToken);
          return { status: 'FORCE_LOGOUT', msg: 'Acceso revocado. Contacta al administrador.' };
        }
      }
      if (def.escritura) {
        lock = LockService.getScriptLock();
        if (!lock.tryLock(30000)) { lock = null; return { status: 'ERROR', msg: 'Servidor ocupado. Se reintentará en unos segundos.', transitorio: true }; }
      }
      const r = def.fn(req, sesion) || { status: 'OK' };
      vaciarAuditoria_(!!lock);
      r.backend = 'appscript';
      r.ms = Date.now() - (t0 || Date.now());
      return r;
    } catch (e) {
      if (e && e.usuario) return { status: 'ERROR', msg: e.message };
      console.error((e && e.stack) || e);
      return { status: 'ERROR', msg: 'Error del servidor: ' + ((e && e.message) || e), transitorio: true };
    } finally {
      if (lock) { try { lock.releaseLock(); } catch (e) {} }
    }
  }


  // =========================================================================
  //  3. ACCIONES
  // =========================================================================

  function accPing_() {
    let configurado = false;
    try { configurado = !!libro_(); } catch (e) { configurado = false; }
    return {
      status: 'OK', backend: 'appscript', version: CONFIG.APP_VERSION, esquema: ESQUEMA.version,
      configurado, hora: new Date().toISOString(),
      modulos: Object.keys(ESQUEMA.modulos),   // la app compara con sus subconfigs
      msg: configurado ? 'Apps Script responde y el proyecto está creado.'
                      : 'Apps Script responde, pero falta ejecutar _CrearProyecto().'
    };
  }

  // ── Sesión ─────────────────────────────────────────────────────────────────
  // =========================================================================
  //  USUARIO DEMO — acceso directo que NO vive en la hoja de usuarios.
  //  DNI 00000000 · contraseña 273430 · rol SuperAdmin.
  //  Para quitarlo: pon USUARIO_DEMO.activo = false (o borra este bloque).
  //  ⚠ La contraseña está en el código y el rol es el MÁXIMO del sistema:
  //    cualquiera que la conozca entra como proveedor del servicio — ve, crea,
  //    edita y BORRA todos los datos de todas las empresas, asigna el rol
  //    SuperAdmin y restablece la contraseña de cualquier administrador, sin
  //    que ninguna comprobación del backend lo detenga. Es un acceso temporal
  //    de pruebas: desactívalo (activo: false) antes de entregar la app.
  // =========================================================================
  const USUARIO_DEMO = {
    activo: true,
    dni: '00000000',
    password: '273430',
    usuario: {
      UUID: 'demo-0000-0000-0000-000000000000',
      DNI: '00000000',
      Nombre_Completo: 'Usuario Demo',
      Email: '',
      Rol: 'SuperAdmin',
      Status: 'Activo',
      Empresa: '',   // vacío = ve todas las empresas (además es SuperAdmin)
      Area: '',
      Puesto: ''
    }
  };
  /** true si el login corresponde al usuario demo (h = SHA-256 de la contraseña). */
  function esLoginDemo_(dni, h) {
    return USUARIO_DEMO.activo && String(dni) === USUARIO_DEMO.dni &&
          iguales_(String(h).toLowerCase(), hashCliente_(USUARIO_DEMO.password));
  }
  /** Copia fresca del usuario demo virtual (con la hora de acceso actual). */
  function usuarioDemo_() {
    return Object.assign({}, USUARIO_DEMO.usuario, { Ultimo_Acceso: ahora_() });
  }

  function accLogin_(req) {
    const dni = String(req.userDNI || '').trim();
    // La app envía la contraseña tal cual (viaja por HTTPS) y aquí se deriva.
    // Se acepta también el formato anterior (hash SHA-256 calculado en el cliente).
    const h = (req.password != null && req.password !== '') ? hashCliente_(String(req.password)) : String(req.userPassHash || '');
    if (!dni || !h) return { status: 'ERROR', msg: 'Ingresa tu DNI y tu contraseña.' };

    // Usuario demo: entra sin figurar en la hoja. Su sesión se marca como demo
    // (crearSesion_ con demo=true) y leerSesion_ la revalida sin tocar la hoja,
    // así NO se mezcla con el admin inicial real, que comparte este DNI.
    if (esLoginDemo_(dni, h)) {
      const ud = usuarioDemo_();
      const empD = leerConfigEmpresa_();
      return {
        status: 'OK',
        userData: Object.assign(usuarioPublico_(ud), {
          SessionToken: crearSesion_(ud, true),
          EmpresaNombre: empD.empresa_nombre || CONFIG.EMPRESA_NOMBRE,
          EmpresaConfig: empD.config || null,
          EmpresaModulos: empD.modulos || null
        })
      };
    }

    if (intentosFallidos_(dni) >= 8) return { status: 'ERROR', msg: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' };

    const t = leerTabla_(hojaUsuarios_());
    const i = buscarFila_(t, 'DNI', dni);
    const u = i >= 0 ? filaAObjeto_(t, t.filas[i]) : null;
    // Mismo mensaje para DNI inexistente y contraseña errada: no revela quién existe
    if (!u || !verificarPassword_(h, u.Password_Hash)) {
      registrarFallo_(dni);
      return { status: 'ERROR', msg: 'DNI o contraseña incorrectos.' };
    }
    if (esBloqueado_(u.Status)) return { status: 'CESADO', msg: 'Acceso revocado. Contacta al administrador.' };
    limpiarFallos_(dni);

    // Último acceso y migración del hash antiguo (sin sal) al formato v2
    const lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
      try {
        const cambios = { Ultimo_Acceso: ahora_() };
        if (!/^v2\$/.test(String(u.Password_Hash))) cambios.Password_Hash = hashPassword_(h);
        actualizarFila_(t, i, cambios);
        auditar_(u.DNI, 'LOGIN', '', '', '');
        vaciarAuditoria_(true);
      } finally { lock.releaseLock(); }
    }

    const token = crearSesion_(u);
    const emp = leerConfigEmpresa_();
    return {
      status: 'OK',
      userData: Object.assign(usuarioPublico_(u), {
        SessionToken: token,
        EmpresaNombre: emp.empresa_nombre || CONFIG.EMPRESA_NOMBRE,
        EmpresaConfig: emp.config || null,
        EmpresaModulos: emp.modulos || null
      })
    };
  }

  function accLogout_(req) {
    cerrarSesion_(req.userToken);
    return { status: 'OK' };
  }

  // ── Lectura ────────────────────────────────────────────────────────────────
  function accLeer_(req, s) {
    const id = req.moduleName;
    if (esModuloUsuarios_(id)) return { status: 'OK', payload: listarUsuarios_(s) };
    const m = moduloOError_(id);
    let filas = registrosVisibles_(s, id, m);
    // Paginación opcional (por defecto se devuelve todo, como Supabase)
    const total = filas.length;
    if (req.pageSize) {
      const tam = Math.max(1, Math.min(1000, parseInt(req.pageSize, 10) || 200));
      const pag = Math.max(0, parseInt(req.page, 10) || 0);
      filas = filas.slice(pag * tam, pag * tam + tam);
      return { status: 'OK', payload: filas, total, page: pag, hasMore: (pag + 1) * tam < total };
    }
    return { status: 'OK', payload: filas, total, msg: total + ' registros' };
  }

  /**
 * QUERY_DB - una PAGINA del modulo, ya filtrada en el servidor.
 *
 * Apps Script no tiene indices: la hoja se lee entera de todos modos. Lo que
 * esto evita es el otro cuello de botella, el que de verdad rompia con miles
 * de filas: serializar la tabla completa y empujarla por google.script.run.
 * Se devuelven 50 filas y un total, no 5000 filas.
 */
function accConsultar_(req, s) {
  const id = req.moduleName;
  const todas = esModuloUsuarios_(id)
    ? listarUsuarios_(s)
    : registrosVisibles_(s, id, moduloOError_(id));
  const clases = clasesDe_(id);
  const buscables = camposBuscables_(id);
  const filtradas = filtrarFilas_(todas, req, clases, buscables);

  const tam = Math.max(1, Math.min(500, parseInt(req.pageSize, 10) || 50));
  const desde = Math.max(0, parseInt(req.desde, 10) || (parseInt(req.page, 10) || 0) * tam);
  const pagina = filtradas.slice(desde, desde + tam);
  return { status: 'OK', payload: pagina, total: filtradas.length, desde: desde,
           hayMas: desde + pagina.length < filtradas.length,
           msg: pagina.length + ' de ' + filtradas.length };
}

/** COUNT_DB - cuantas filas cumplen la condicion. No devuelve ninguna fila. */
function accContar_(req, s) {
  const id = req.moduleName;
  const todas = esModuloUsuarios_(id)
    ? listarUsuarios_(s)
    : registrosVisibles_(s, id, moduloOError_(id));
  const n = filtrarFilas_(todas, req, clasesDe_(id), camposBuscables_(id)).length;
  return { status: 'OK', total: n, payload: n };
}

/**
 * AGG_DB - agregado (count/sum/max/min/avg) sobre todas las filas visibles.
 * Equivalente de motor_agregado() de Postgres, para que un KPI de un modulo
 * de un el MISMO numero con cualquiera de los dos proveedores.
 */
function accAgregar_(req, s) {
  const id = req.moduleName;
  const todas = esModuloUsuarios_(id)
    ? listarUsuarios_(s)
    : registrosVisibles_(s, id, moduloOError_(id));
  try {
    const valor = agregarSobre_(todas, clasesDe_(id), req);
    return { status: 'OK', valor: valor, payload: valor == null ? null : Number(valor) };
  } catch (e) {
    return { status: 'ERROR', msg: (e && e.message) || String(e) };
  }
}

/**
 * AGG_BATCH - VARIOS agregados en UNA sola peticion.
 *
 * Importa mucho aqui, no en Supabase. En Postgres cada conteo usa un indice y
 * sale casi gratis; en Sheets no hay indices: cada peticion relee la hoja
 * entera, y _MEMO se vacia al empezar cada una (ver serverRouter). Con los
 * cuatro KPI de un modulo pidiendo por separado, un Resumen leia la hoja
 * CINCO veces -una por la pagina y una por KPI-, mas trabajo del que hacia
 * antes de paginar. Agrupados, la hoja se lee una vez.
 *   req.consultas = [{ metrica, campo, cond }, ...]
 *   respuesta     = { valores: ['3480', '12', null, ...] }
 */
function accAgregarLote_(req, s) {
  const id = req.moduleName;
  const consultas = Array.isArray(req.consultas) ? req.consultas.slice(0, 20) : [];
  if (!consultas.length) return { status: 'OK', valores: [] };
  // UNA lectura de la hoja para todas las consultas del lote.
  const todas = esModuloUsuarios_(id)
    ? listarUsuarios_(s)
    : registrosVisibles_(s, id, moduloOError_(id));
  const clases = clasesDe_(id);
  const valores = consultas.map(function (c) {
    try { return agregarSobre_(todas, clases, c); }
    catch (e) { return null; }
  });
  return { status: 'OK', valores: valores, filas: todas.length };
}

/** Un agregado sobre filas ya leidas. Lo comparten AGG_DB y AGG_BATCH. */
function agregarSobre_(filas, clases, c) {
  const metrica = String((c && c.metrica) || 'count').toLowerCase();
  if (['count', 'sum', 'max', 'min', 'avg'].indexOf(metrica) === -1) {
    throw errorUsuario_('Metrica no permitida: ' + metrica);
  }
  const sel = filtrarFilas_(filas, { cond: (c && c.cond) || {} }, clases, []);
  if (metrica === 'count') return String(sel.length);

  const campo = String((c && c.campo) || '');
  if (!campo) throw errorUsuario_('Falta el campo del agregado.');
  const vals = sel.map(function (r) { return r[campo]; })
                  .filter(function (v) { return v != null && v !== ''; });
  if (!vals.length) return null;

  if (metrica === 'max' || metrica === 'min') {
    const clase = clases[campo];
    const orden = vals.slice().sort(function (a, b) { return comparar_(a, b, clase); });
    return String(metrica === 'max' ? orden[orden.length - 1] : orden[0]);
  }
  const nums = vals.map(parseFloat).filter(function (v) { return !isNaN(v); });
  if (!nums.length) return null;
  const suma = nums.reduce(function (a, b) { return a + b; }, 0);
  return String(metrica === 'avg' ? (suma / nums.length) : suma);
}

/** Clases de comparacion del modulo (del ESQUEMA generado). Ausente = texto. */
function clasesDe_(id) {
  const m = esModuloUsuarios_(id) ? ESQUEMA.usuarios : ESQUEMA.modulos[id];
  return (m && m.clases) || {};
}

/**
 * Campos donde busca el termino libre: ni fechas, ni numeros, ni fotos, ni
 * hashes de contrasena. Buscar "2024" no debe acertar dentro de un base64.
 */
function camposBuscables_(id) {
  const m = esModuloUsuarios_(id) ? ESQUEMA.usuarios : ESQUEMA.modulos[id];
  if (!m) return [];
  const clases = (m.clases) || {};
  return (m.campos || []).filter(function (c) {
    const k = clases[c];
    return !k || k === 'enum';
  }).filter(function (c) { return !/password/i.test(c); });
}

/** Ahora en Peru (GMT-5). */
function ahoraPeru_() { return new Date(Date.now() - 5 * 3600 * 1000); }

/** Fecha de hoy en Peru (GMT-5) como YYYY-MM-DD. */
function hoyPeru_() { return ahoraPeru_().toISOString().slice(0, 10); }

/**
 * Mismos comodines que FILTRO_LOCAL en el navegador:
 *   '@hoy' '@hoy-30' '@hoy+7'   fecha        '@mes' '@mes-1'   primer dia del mes
 *   '@hora'                     hora (HH:MM)
 * Normalmente llegan ya resueltos desde el cliente; se resuelven igual aqui
 * para que una llamada directa al backend de el mismo numero.
 */
function resolverComodin_(v) {
  if (typeof v !== 'string' || v.charAt(0) !== '@') return v;
  if (v === '@hora') return ahoraPeru_().toISOString().slice(11, 16);
  var m = v.match(/^@hoy([+-]\d+)?$/);
  if (m) {
    var dias = m[1] ? parseInt(m[1], 10) : 0;
    return new Date(ahoraPeru_().getTime() + dias * 86400000).toISOString().slice(0, 10);
  }
  m = v.match(/^@mes([+-]\d+)?$/);
  if (m) {
    var d = ahoraPeru_(), meses = m[1] ? parseInt(m[1], 10) : 0;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1)).toISOString().slice(0, 10);
  }
  return v;
}

/** Comparacion segun la clase del campo: las fechas y los numeros no son texto. */
function comparar_(valor, otro, clase) {
  if (clase === 'date') {
    const a = Date.parse(valor), b = Date.parse(otro);
    return (isNaN(a) || isNaN(b)) ? null : (a < b ? -1 : a > b ? 1 : 0);
  }
  if (clase === 'numeric') {
    const a = parseFloat(valor), b = parseFloat(otro);
    return (isNaN(a) || isNaN(b)) ? null : (a < b ? -1 : a > b ? 1 : 0);
  }
  const a = String(valor == null ? '' : valor), b = String(otro == null ? '' : otro);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * MISMO lenguaje de condiciones que FILTRO_LOCAL (navegador) y que
 * SupabaseProvider._condicionesPG (Postgres). Si los tres no coinciden, el
 * mismo KPI da numeros distintos segun el proveedor activo.
 *   req.filtros  = { Campo: 'texto' }   panel de filtros del usuario
 *   req.busqueda = 'libre'              termino global
 *   req.cond     = { Campo: { op: v } } condicion declarativa de un KPI
 * Operadores: eq neq lt lte gt gte like in nulo
 */
function filtrarFilas_(filas, req, clases, buscables) {
  const filtros = req.filtros || {};
  const cond = req.cond || {};
  const q = String(req.busqueda == null ? '' : req.busqueda).trim().toLowerCase();
  const claves = Object.keys(filtros).filter(function (k) { return filtros[k] !== '' && filtros[k] != null; });
  const campos = Object.keys(cond);
  if (!claves.length && !campos.length && !q) return filas;

  return filas.filter(function (fila) {
    for (var i = 0; i < claves.length; i++) {
      const campo = claves[i], v = filtros[campo], clase = clases[campo];
      const valor = String(fila[campo] == null ? '' : fila[campo]);
      if (!clase || clase === 'opaco') {
        if (valor.toLowerCase().indexOf(String(v).toLowerCase()) === -1) return false;
      } else if (valor !== String(v)) return false;
    }

    if (q) {
      var hay = false;
      for (var j = 0; j < buscables.length; j++) {
        if (String(fila[buscables[j]] == null ? '' : fila[buscables[j]]).toLowerCase().indexOf(q) !== -1) { hay = true; break; }
      }
      if (!hay) return false;
    }

    for (var k = 0; k < campos.length; k++) {
      const campo = campos[k], regla = cond[campo];
      if (regla == null) continue;
      // Alternativas: basta con que la fila cumpla UNA de las condiciones.
      if (campo === '$o') {
        const alts = [].concat(regla);
        var alguna = !alts.length;
        for (var z = 0; z < alts.length && !alguna; z++) {
          if (filtrarFilas_([fila], { cond: alts[z] }, clases, []).length) alguna = true;
        }
        if (!alguna) return false;
        continue;
      }
      const clase = clases[campo];
      const valor = fila[campo];
      if (typeof regla !== 'object') {
        if (String(valor == null ? '' : valor) !== String(resolverComodin_(regla))) return false;
        continue;
      }
      const ops = Object.keys(regla);
      for (var o = 0; o < ops.length; o++) {
        const op = ops[o], esperado = resolverComodin_(regla[op]);
        if (op === 'nulo') {
          const vacio = valor == null || valor === '';
          if (esperado ? !vacio : vacio) return false;
        } else if (op === 'like') {
          if (String(valor == null ? '' : valor).toLowerCase().indexOf(String(esperado).toLowerCase()) === -1) return false;
        } else if (op === 'in') {
          if ([].concat(esperado).map(String).indexOf(String(valor == null ? '' : valor)) === -1) return false;
        } else if (op === 'eq' || op === 'neq') {
          const igual = String(valor == null ? '' : valor) === String(esperado);
          if (op === 'eq' ? !igual : igual) return false;
        } else if (['lt', 'lte', 'gt', 'gte'].indexOf(op) !== -1) {
          // Un valor vacio no cumple ninguna desigualdad: una inspeccion SIN
          // plazo no esta vencida. Tratar '' como menor que cualquier fecha
          // haria que el KPI inventara incumplimientos.
          if (valor == null || valor === '') return false;
          const c = comparar_(valor, esperado, clase);
          if (c === null) return false;
          if (op === 'lt'  && !(c <  0)) return false;
          if (op === 'lte' && !(c <= 0)) return false;
          if (op === 'gt'  && !(c >  0)) return false;
          if (op === 'gte' && !(c >= 0)) return false;
        }
      }
    }
    return true;
  });
}

function accDelta_(req, s) {
    const id = req.moduleName;
    if (esModuloUsuarios_(id)) return { status: 'OK', payload: listarUsuarios_(s) };
    const m = moduloOError_(id);
    // La app envía la hora de Perú con sufijo Z: el margen de 6 h evita perder
    // cambios por esa diferencia (a lo sumo se reciben registros repetidos).
    const desde = Date.parse(String(req.lastSyncDate || '2000-01-01')) - 6 * 3600 * 1000;
    const filas = registrosVisibles_(s, id, m).filter(o => {
      const ts = Date.parse(o.Actualizado_En || o.Creado_En || '');
      return !isNaN(ts) && ts >= desde;
    });
    return { status: 'OK', payload: filas, msg: filas.length + ' registros nuevos o editados' };
  }

  function accHijos_(req, s) {
    const m = moduloOError_(req.moduleName);
    if (!m.hojaHija) return { status: 'OK', payload: [] };
    const uuid = String(req.parentUuid || req.uuid || '');
    const padre = buscarRegistro_(m, uuid);
    if (!padre || !puedeLeer_(s, req.moduleName, padre)) return { status: 'OK', payload: [] };
    const t = leerTabla_(m.hojaHija);
    const iPadre = t.idx.PARENT_UUID;
    const payload = t.filas.filter(f => String(f[iPadre]) === uuid).map(f => filaAObjeto_(t, f));
    return { status: 'OK', payload };
  }

  /** Archivos de Drive → dataURL. Solo los de registros que el usuario puede ver. */
  function accArchivos_(req, s) {
    const refs = (Array.isArray(req.refs) ? req.refs : []).slice(0, 20);
    const out = {};
    let acumulado = 0;
    const TOPE_ARCHIVO = 6 * 1024 * 1024, TOPE_TOTAL = 15 * 1024 * 1024;
    refs.forEach(ref => {
      out[ref] = '';
      const id = idDeRef_(ref);
      if (!id) return;
      try {
        const f = DriveApp.getFileById(id);
        const meta = String(f.getDescription() || '').split('|');
        if (meta[0] !== 'MOTOR' || !puedeVerArchivo_(s, meta[1], meta[2])) return;
        const tam = f.getSize();
        if (tam > TOPE_ARCHIVO || acumulado + tam > TOPE_TOTAL) return;
        const blob = f.getBlob();
        acumulado += tam;
        out[ref] = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
      } catch (e) { out[ref] = ''; }
    });
    return { status: 'OK', archivos: out };
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  /**
  * Guarda un lote de la cola offline. Cada elemento: { id, payload, childPayload }.
  * Responde por elemento (okIds / fallos) para que la cola distinga un rechazo
  * real de un fallo transitorio.
  */
  function accSync_(req, s) {
    const id = req.moduleName;
    const items = normalizarItems_(req);
    const okIds = [], fallos = [];
    items.forEach(it => {
      try {
        if (esModuloUsuarios_(id)) guardarUsuario_(s, it.payload || {});
        else guardarRegistro_(s, id, it.payload || {}, it.childPayload);
        okIds.push(it.id);
      } catch (e) {
        if (!e.usuario) console.error((e && e.stack) || e);
        fallos.push({ id: it.id, msg: (e && e.message) || String(e), transitorio: !e.usuario });
      }
    });
    return {
      status: fallos.length === 0 ? 'OK' : (okIds.length ? 'PARTIAL' : 'ERROR'),
      processed: items.length, success: okIds.length, errors: fallos.length,
      okIds, fallos, msg: fallos.map(f => f.msg).join('; ')
    };
  }

  function accEliminar_(req, s) {
    const id = req.moduleName;
    if (esModuloUsuarios_(id)) throw errorUsuario_('Las cuentas no se eliminan: márcalas como Cesado.');
    const m = moduloOError_(id);
    const uuids = (req.uuids || req.dataIdsToBeDeleted || []).map(String);
    const t = leerTabla_(m.hoja);
    const borrar = [], rechazados = [];
    uuids.forEach(u => {
      const i = buscarFila_(t, 'UUID', u);
      if (i < 0) { rechazados.push(u + ' (no existe)'); return; }
      if (!puedeEscribir_(s, id, 'eliminar', filaAObjeto_(t, t.filas[i]))) { rechazados.push(u + ' (sin permiso)'); return; }
      borrar.push({ uuid: u, fila: i + 2 });
    });
    // Los archivos de Drive se conservan: borrar un registro no destruye la evidencia
    if (borrar.length && m.hojaHija) {
      const th = leerTabla_(m.hojaHija);
      const iP = th.idx.PARENT_UUID;
      const set = {};
      borrar.forEach(b => { set[b.uuid] = true; });
      const filasHijas = [];
      th.filas.forEach((f, i) => { if (set[String(f[iP])]) filasHijas.push(i + 2); });
      borrarFilas_(th, filasHijas);
    }
    borrarFilas_(t, borrar.map(b => b.fila));
    borrar.forEach(b => auditar_(s.dni, 'ELIMINAR', id, b.uuid, ''));
    if (!borrar.length) return { status: 'ERROR', msg: 'No se eliminó nada: ' + rechazados.join(', ') };
    return { status: rechazados.length ? 'PARTIAL' : 'OK', eliminados: borrar.length,
            msg: borrar.length + ' eliminado(s)' + (rechazados.length ? '; no: ' + rechazados.join(', ') : '') };
  }

  /**
 * Constancia de autorización de firma digital (la que firma cada persona la
 * primera vez que entra a la app, ver 00_Config/Consentimiento.js.html).
 *
 * Se archiva en   DATA/01_Usuarios/00_Usabilidad/<EMPRESA>/<DNI>.pdf
 * Una carpeta por empresa y un archivo por persona: así una fiscalización
 * pide "las autorizaciones de la contratista X" y es una sola carpeta.
 *
 * Cada quien guarda la SUYA. Un Admin puede guardar la de alguien de su
 * empresa (p. ej. si la firma en el equipo de la oficina), nadie más: la
 * constancia lleva la firma y el rostro de una persona concreta.
 */
function accGuardarConsentimiento_(req, s) {
  const dni = String(req.dni || '').trim();
  if (!dni) throw errorUsuario_('Falta el DNI de la constancia.');

  const propio = dni === String(s.dni);
  if (!propio) {
    if (!esAdmin_(s)) throw errorUsuario_('Solo puedes guardar tu propia constancia.');
    const objetivo = usuarioPorDni_(dni);
    if (!objetivo) throw errorUsuario_('Usuario no encontrado.');
    if (!mismaEmpresaUsuario_(s, objetivo)) throw errorUsuario_('Esa persona pertenece a otra empresa.');
  }

  const b64 = String(req.pdfBase64 || '');
  if (!b64) throw errorUsuario_('La constancia llegó vacía.');
  // 8 MB de PDF es muchísimo para una hoja con una firma y una selfie:
  // más que eso es un error del cliente, no un documento legítimo.
  if (b64.length > 8 * 1024 * 1024) throw errorUsuario_('La constancia supera el tamaño permitido.');

  let bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e) { throw errorUsuario_('La constancia no se pudo decodificar.'); }

  // El nombre de la empresa viene del cliente solo como etiqueta de carpeta:
  // el dato que manda es el de la hoja, para que nadie archive en una carpeta
  // ajena escribiendo otro nombre.
  const empresaReal = propio ? (s.empresa || '') : ((usuarioPorDni_(dni) || {}).Empresa || '');
  const empresa = limpiarNombreCarpeta_(empresaReal || req.empresa || 'Sin empresa');

  const base = subcarpeta_(subcarpeta_(carpetaData_(), ESQUEMA.usuarios.id || '01_Usuarios'), '00_Usabilidad');
  const destino = subcarpeta_(base, empresa);

  const nombre = dni.replace(/[^\w.-]/g, '_') + '.pdf';
  // Una constancia por persona: si vuelve a firmar, la anterior se manda a
  // la papelera (no se borra para siempre) y queda la última.
  const previos = destino.getFilesByName(nombre);
  while (previos.hasNext()) previos.next().setTrashed(true);

  const file = destino.createFile(Utilities.newBlob(bytes, 'application/pdf', nombre));
  auditar_(s.dni, 'CONSENTIMIENTO', ESQUEMA.usuarios.id, file.getId(), dni + ' · ' + empresa);

  return { status: 'OK', fileId: file.getId(),
           ruta: 'drive:' + file.getId() + '/' + nombre,
           carpeta: empresa };
}

/** Nombre de carpeta seguro para Drive (sin barras ni caracteres raros). */
function limpiarNombreCarpeta_(nombre) {
  const n = String(nombre || '').replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return n.slice(0, 80) || 'Sin empresa';
}

function accGuardarConfig_(req, s) {
    if (!esAdmin_(s)) throw errorUsuario_('Solo el administrador puede cambiar la configuración.');
    const actual = leerConfigEmpresa_().config || {};
    const nueva = Object.assign({}, actual, (req.config && typeof req.config === 'object') ? req.config : {});
    const json = JSON.stringify(nueva);
    if (json.length > 65536) throw errorUsuario_('La configuración supera el tamaño permitido (64 KB).');
    escribirConfig_('config', json);
    _MEMO.empresa = null;   // la visibilidad nueva rige desde ya
    auditar_(s.dni, 'CONFIG', '04_Configuraciones', '', Object.keys(req.config || {}).join(','));
    return { status: 'OK', config: nueva };
  }

  // ── Cuentas ────────────────────────────────────────────────────────────────
  function accCrearUsuario_(req, s) {
    if (!esAdmin_(s)) throw errorUsuario_('Solo un administrador puede crear cuentas.');
    const d = req.datos || {};
    const dni = String(d.DNI || '').trim();
    const nombre = String(d.Nombre_Completo || '').trim();
    if (!/^[0-9A-Za-z-]{6,15}$/.test(dni)) throw errorUsuario_('DNI inválido (6 a 15 caracteres, sin espacios).');
    if (!nombre) throw errorUsuario_('El nombre es obligatorio.');
    const err = passwordInvalida_(req.password);
    if (err) throw errorUsuario_(err);
    const rol = normalizarRol_(d.Rol || 'Trabajador');
    if (rol === 'superadmin' && s.rol !== 'superadmin') throw errorUsuario_('Solo el proveedor del servicio asigna el rol SuperAdmin.');
    // Un Admin con empresa solo da de alta en la suya; solo el proveedor coloca
    // a alguien en otra empresa.
    if (s.rol !== 'superadmin' && claveEmpresa_(s.empresa)) d.Empresa = s.empresa;

    const t = leerTabla_(hojaUsuarios_());
    if (buscarFila_(t, 'DNI', dni) >= 0) throw errorUsuario_('Ya existe una cuenta con el DNI ' + dni + '.');
    const uuid = /^[0-9a-f-]{20,}$/i.test(String(d.UUID || '')) ? String(d.UUID) : Utilities.getUuid();
    if (buscarFila_(t, 'UUID', uuid) >= 0) throw errorUsuario_('Identificador de usuario repetido.');

    const ahora = ahora_();
    const nuevo = {
      UUID: uuid, DNI: dni, Nombre_Completo: nombre, Email: String(d.Email || '').trim(),
      Rol: ETIQUETA_ROL[rol], Status: d.Status === 'Cesado' ? 'Cesado' : 'Activo',
      Password_Hash: hashPassword_(hashCliente_(String(req.password))),
      Creado_En: ahora, Actualizado_En: ahora
    };
    ['Empresa', 'Area', 'Puesto'].forEach(c => { if (d[c] != null) nuevo[c] = valorTexto_(d[c]); });
    ESQUEMA.usuarios.archivos.forEach(c => { if (d[c]) nuevo[c] = d[c]; });
    procesarArchivos_(ESQUEMA.usuarios, ESQUEMA.usuarios.id, uuid, nuevo, null);
    agregarFilas_(t, [objetoAFila_(t, nuevo)]);
    auditar_(s.dni, 'CREAR_USUARIO', ESQUEMA.usuarios.id, uuid, dni + ' · ' + nuevo.Rol);
    return { status: 'OK', uuid };
  }

  function accCambiarPassword_(req, s) {
    const err = passwordInvalida_(req.password);
    if (err) throw errorUsuario_(err);
    const t = leerTabla_(hojaUsuarios_());
    let i = buscarFila_(t, 'UUID', String(req.uuid || ''));
    if (i < 0) i = buscarFila_(t, 'DNI', String(req.uuid || ''));
    if (i < 0) throw errorUsuario_('Usuario no encontrado.');
    const objetivo = filaAObjeto_(t, t.filas[i]);
    const propio = String(objetivo.DNI) === s.dni;
    const rolObj = normalizarRol_(objetivo.Rol);
    if (!propio) {
      if (!esAdmin_(s)) throw errorUsuario_('Solo un administrador cambia contraseñas ajenas.');
      if (!mismaEmpresaUsuario_(s, objetivo)) throw errorUsuario_('Esa cuenta pertenece a otra empresa.');
      if (s.rol !== 'superadmin' && (rolObj === 'admin' || rolObj === 'superadmin')) {
        throw errorUsuario_('La contraseña de otro administrador solo la restablece el proveedor del servicio.');
      }
    }
    actualizarFila_(t, i, { Password_Hash: hashPassword_(hashCliente_(String(req.password))), Actualizado_En: ahora_() });
    limpiarFallos_(objetivo.DNI);
    // Cierra las sesiones abiertas con la contraseña anterior (salvo la propia)
    CacheService.getScriptCache().put('pwd_' + objetivo.DNI, String(Date.now()), ttlSesion_());
    if (propio && req.userToken) {
      CacheService.getScriptCache().put('sess_' + req.userToken, JSON.stringify({ dni: String(objetivo.DNI), desde: Date.now() + 1 }), ttlSesion_());
    }
    auditar_(s.dni, 'CAMBIAR_PASSWORD', ESQUEMA.usuarios.id, objetivo.UUID, objetivo.DNI);
    return { status: 'OK', uuid: objetivo.UUID };
  }

  function accVerificar_(req, s) {
    if (!esAdmin_(s)) throw errorUsuario_('Solo un administrador puede ejecutar el diagnóstico.');
    return { status: 'OK', checks: verificarEstructura_({ escritura: true, red: false }) };
  }


  // =========================================================================
  //  4. REGISTROS DE MÓDULO
  // =========================================================================
  // Las pone el servidor; lo que mande el cliente en estas columnas se ignora.
  const COLUMNAS_SISTEMA = ['Creado_Por_DNI', 'Creado_En', 'Actualizado_En'];

  /**
  * Columna donde vive la empresa DUEÑA del registro. Normalmente 'Empresa';
  * en 08_PETAR es 'Empresa_Registro', porque ahí 'Empresa' ya es un campo del
  * formulario (la contratista que ejecuta el trabajo). Lo decide el generador
  * y viaja en el ESQUEMA, así que backend y hoja no se pueden desincronizar.
  */
  function colEmpresa_(m) { return (m && m.columnaEmpresa) || 'Empresa'; }

  function moduloOError_(id) {
    const m = ESQUEMA.modulos[id];
    if (!m) throw errorUsuario_('Módulo desconocido en el backend: ' + id + '. Regenera Code.gs (node tools/gen_appscript.js).');
    return m;
  }

  function registrosVisibles_(s, id, m) {
    const t = leerTabla_(m.hoja);
    return t.filas
      .map(f => filaAObjeto_(t, f))
      .filter(o => o.UUID && puedeLeer_(s, id, o))
      .map(o => conAlias_(o, m))
      .sort((a, b) => String(b.Creado_En || '').localeCompare(String(a.Creado_En || '')));
  }

  /** Alias en minúscula como los que entrega Supabase (los usa PERMISOS.filtrarDatos). */
  function conAlias_(o, m) {
    o.creado_por_dni = o.Creado_Por_DNI || '';
    o.creado_en = o.Creado_En || '';
    // Nombre único para el frontend, venga de 'Empresa' o de 'Empresa_Registro'
    o.empresa_registro = o[colEmpresa_(m)] || '';
    return o;
  }

  function buscarRegistro_(m, uuid) {
    const t = leerTabla_(m.hoja);
    const i = buscarFila_(t, 'UUID', uuid);
    return i >= 0 ? filaAObjeto_(t, t.filas[i]) : null;
  }

  function guardarRegistro_(s, id, datos, hijos) {
    const m = moduloOError_(id);
    const uuid = String(datos.UUID || '').trim();
    if (!uuid) throw errorUsuario_('El registro no tiene UUID.');
    const t = leerTabla_(m.hoja);
    const i = buscarFila_(t, 'UUID', uuid);
    const previo = i >= 0 ? filaAObjeto_(t, t.filas[i]) : null;

    if (previo) {
      if (!puedeEscribir_(s, id, 'editar', previo)) throw errorUsuario_('No tienes permiso para editar este registro.');
    } else if (!puedeCrear_(s, id)) {
      throw errorUsuario_('Tu rol no puede crear registros en este módulo.');
    }

    // Solo columnas del esquema. La autoría y las fechas las pone el servidor.
    const nuevo = {};
    const colEmp = colEmpresa_(m);
    m.campos.forEach(c => {
      if (c === 'UUID' || c === colEmp || COLUMNAS_SISTEMA.indexOf(c) !== -1) return;
      if (datos[c] !== undefined) nuevo[c] = (m.archivos.indexOf(c) !== -1) ? String(datos[c] || '') : valorTexto_(datos[c]);
    });
    procesarArchivos_(m, id, uuid, nuevo, previo);

    const ahora = ahora_();
    const final = Object.assign({}, previo || {}, nuevo, { Creado_Por_DNI: previo ? previo.Creado_Por_DNI : s.dni });
    validarAprobacion_(m, final, previo);

    if (previo) {
      nuevo.Actualizado_En = ahora;
      actualizarFila_(t, i, nuevo);
    } else {
      // La empresa se sella aquí y ya no cambia: mover a alguien de contratista
      // no reasigna los registros que dejó hechos.
      nuevo[colEmp] = s.empresa || '';
      Object.assign(nuevo, { UUID: uuid, Creado_Por_DNI: s.dni, Creado_En: ahora, Actualizado_En: ahora });
      agregarFilas_(t, [objetoAFila_(t, nuevo)]);
    }

    if (m.hojaHija && Array.isArray(hijos)) {
      const padre = previo || Object.assign({}, nuevo);
      const reciente = Date.now() - Date.parse(padre.Creado_En || ahora) < 24 * 3600 * 1000;
      // Como en Supabase: escribe el detalle quien puede editar el padre, o
      // quien lo creó durante sus primeras 24 h.
      if (!(puedeEscribir_(s, id, 'editar', padre) || (esPropio_(s, padre) && reciente))) {
        throw errorUsuario_('No tienes permiso para modificar el detalle de este registro.');
      }
      reemplazarHijos_(m, uuid, hijos);
    }
    auditar_(s.dni, previo ? 'EDITAR' : 'CREAR', id, uuid, '');
    if (!previo && m.emailTemplateId) enviarCorreoSeguro_(m, final, hijos || []);
  }

  /** Sustituye el detalle: primero añade lo nuevo y, solo después, quita lo viejo. */
  function reemplazarHijos_(m, uuid, hijos) {
    const t = leerTabla_(m.hojaHija);
    const iP = t.idx.PARENT_UUID;
    const viejas = [];
    t.filas.forEach((f, i) => { if (String(f[iP]) === uuid) viejas.push(i + 2); });
    const ahora = ahora_();
    const matriz = hijos.map(h => {
      const o = { PARENT_UUID: uuid, Creado_En: ahora };
      m.camposHijo.forEach(c => { if (h && h[c] !== undefined) o[c] = valorTexto_(h[c]); });
      return objetoAFila_(t, o);
    });
    agregarFilas_(t, matriz);
    borrarFilas_(t, viejas);
  }

  /** PETAR: quien solicita el permiso no puede figurar como su aprobador. */
  function validarAprobacion_(m, final, previo) {
    if (!m.validarAprobacion) return;
    const ap = String(final.Aprobado_Por || '').trim();
    const cambia = !previo || String(previo.Aprobado_Por || '').trim() !== ap ||
                  (final.Estado === 'Aprobado' && previo.Estado !== 'Aprobado');
    if (cambia && ap && ap === String(final.Creado_Por_DNI || '')) {
      throw errorUsuario_('Un PETAR no puede aprobarlo la misma persona que lo solicitó.');
    }
  }

  /** Admite el formato nuevo ({items}) y el antiguo ({dataArray, childDataArray}). */
  function normalizarItems_(req) {
    if (Array.isArray(req.items)) {
      return req.items.map((it, n) => ({ id: it.id != null ? it.id : n, payload: it.payload, childPayload: it.childPayload }));
    }
    const hijos = Array.isArray(req.childDataArray) ? req.childDataArray : [];
    return (req.dataArray || []).map((p, n) => ({
      id: n, payload: p,
      childPayload: hijos.filter(h => String(h.PARENT_UUID || h.parent_uuid || '') === String(p.UUID))
    }));
  }


  // =========================================================================
  //  5. USUARIOS
  // =========================================================================
  const ETIQUETA_ROL = { superadmin: 'SuperAdmin', admin: 'Admin', supervisor: 'Supervisor', trabajador: 'Trabajador' };
  const CAMPOS_PERFIL = ['Nombre_Completo', 'Email', 'Rol', 'Status', 'Empresa', 'Area', 'Puesto'];

  function hojaUsuarios_() { return ESQUEMA.usuarios.hoja; }
  function esModuloUsuarios_(id) { return id === ESQUEMA.usuarios.id; }

  function normalizarRol_(r) {
    const s = String(r || '').toLowerCase().replace(/[\s_-]/g, '');
    if (s === 'superadmin') return 'superadmin';
    if (s === 'admin' || s === 'administrador') return 'admin';
    if (s === 'supervisor') return 'supervisor';
    return 'trabajador';
  }
  function esBloqueado_(status) { return ['cesado', 'inactivo'].indexOf(String(status || '').trim().toLowerCase()) !== -1; }

  function usuarioPublico_(u) {
    const o = {};
    Object.keys(u).forEach(k => { if (k !== 'Password_Hash') o[k] = u[k]; });
    o.Rol = ETIQUETA_ROL[normalizarRol_(u.Rol)];
    return o;
  }

  function listarUsuarios_(s) {
    const t = leerTabla_(hojaUsuarios_());
    const todos = s.rol === 'superadmin' || s.rol === 'admin' || s.rol === 'supervisor';
    const mia = claveEmpresa_(s.empresa);
    return t.filas.map(f => filaAObjeto_(t, f))
      .filter(u => u.DNI && (todos || String(u.DNI) === s.dni))
      // Un Admin o Supervisor con empresa solo ve al personal de su empresa
      // (más su propia ficha, por si aún no tiene empresa asignada).
      .filter(u => s.rol === 'superadmin' || !mia || String(u.DNI) === s.dni ||
                  !claveEmpresa_(u.Empresa) || claveEmpresa_(u.Empresa) === mia)
      .map(usuarioPublico_);
  }

  /** Edición de perfil (cola offline). La contraseña nunca viaja por aquí. */
  function guardarUsuario_(s, datos) {
    if (!esAdmin_(s)) throw errorUsuario_('Solo un administrador edita cuentas.');
    const t = leerTabla_(hojaUsuarios_());
    let i = buscarFila_(t, 'UUID', String(datos.UUID || ''));
    if (i < 0) i = buscarFila_(t, 'DNI', String(datos.DNI || ''));
    if (i < 0) throw errorUsuario_('El usuario ' + (datos.DNI || '') + ' no existe. Las cuentas nuevas se crean desde Usuarios → Nuevo (con conexión).');
    const previo = filaAObjeto_(t, t.filas[i]);
    if (datos.DNI && String(datos.DNI).trim() !== String(previo.DNI)) throw errorUsuario_('El DNI es la llave de la cuenta y no se cambia.');
    if (!mismaEmpresaUsuario_(s, previo)) throw errorUsuario_('Esa cuenta pertenece a otra empresa.');

    const cambios = {};
    CAMPOS_PERFIL.forEach(c => { if (datos[c] !== undefined && t.idx[c] !== undefined) cambios[c] = valorTexto_(datos[c]); });
    if (cambios.Rol !== undefined) {
      const rol = normalizarRol_(cambios.Rol);
      if (rol === 'superadmin' && s.rol !== 'superadmin') throw errorUsuario_('Solo el proveedor del servicio asigna el rol SuperAdmin.');
      if (normalizarRol_(previo.Rol) === 'superadmin' && s.rol !== 'superadmin') throw errorUsuario_('No puedes modificar la cuenta del proveedor.');
      cambios.Rol = ETIQUETA_ROL[rol];
    }
    if (cambios.Status !== undefined) cambios.Status = esBloqueado_(cambios.Status) ? 'Cesado' : 'Activo';
    // Mover a alguien a otra empresa es sacarlo del alcance de su Admin: solo
    // lo hace el proveedor del servicio.
    if (cambios.Empresa !== undefined && s.rol !== 'superadmin' && claveEmpresa_(s.empresa) &&
        claveEmpresa_(cambios.Empresa) !== claveEmpresa_(s.empresa)) {
      throw errorUsuario_('Solo el proveedor del servicio cambia a una persona de empresa.');
    }
    if (String(previo.DNI) === s.dni && ((cambios.Rol && normalizarRol_(cambios.Rol) !== normalizarRol_(previo.Rol)) ||
        (cambios.Status && cambios.Status !== previo.Status))) {
      throw errorUsuario_('No puedes cambiar tu propio rol ni tu estado.');
    }
    ESQUEMA.usuarios.archivos.forEach(c => { if (datos[c]) cambios[c] = String(datos[c]); });
    procesarArchivos_(ESQUEMA.usuarios, ESQUEMA.usuarios.id, previo.UUID, cambios, previo);
    cambios.Actualizado_En = ahora_();
    actualizarFila_(t, i, cambios);
    CacheService.getScriptCache().remove('usr_' + previo.DNI);
    auditar_(s.dni, 'EDITAR_USUARIO', ESQUEMA.usuarios.id, previo.UUID, previo.DNI);
  }

  function usuarioPorDni_(dni) {
    const cache = CacheService.getScriptCache();
    const clave = 'usr_' + dni;
    const c = cache.get(clave);
    if (c) return JSON.parse(c);
    const t = leerTabla_(hojaUsuarios_());
    const i = buscarFila_(t, 'DNI', String(dni));
    if (i < 0) return null;
    const u = usuarioPublico_(filaAObjeto_(t, t.filas[i]));
    // 2 minutos: cesar a alguien o cambiar su rol se aplica casi al instante
    cache.put(clave, JSON.stringify(u), 120);
    return u;
  }


  // =========================================================================
  //  6. SESIONES Y CONTRASEÑAS
  // =========================================================================
  function ttlSesion_() { return Math.min(21600, Math.max(600, Math.round((CONFIG.SESSION_HOURS || 6) * 3600))); }

  function crearSesion_(u, demo) {
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    const dato = { dni: String(u.DNI), desde: Date.now() };
    if (demo) dato.demo = true;   // sesión del usuario demo (no vive en la hoja)
    CacheService.getScriptCache().put('sess_' + token, JSON.stringify(dato), ttlSesion_());
    return token;
  }

  function leerSesion_(token) {
    if (!token || typeof token !== 'string' || token.length < 40) return null;
    const cache = CacheService.getScriptCache();
    const raw = cache.get('sess_' + token);
    if (!raw) return null;
    const ses = JSON.parse(raw);
    // Sesión del usuario demo: virtual, se revalida sin leer la hoja de usuarios.
    if (ses.demo && USUARIO_DEMO.activo) {
      cache.put('sess_' + token, raw, ttlSesion_());   // caducidad deslizante
      const d = usuarioDemo_();
      return { token, dni: String(d.DNI), uuid: d.UUID, nombre: d.Nombre_Completo,
              rol: normalizarRol_(d.Rol), empresa: d.Empresa || '', bloqueado: false };
    }
    // Una sesión abierta antes del último cambio de contraseña ya no vale
    const cambioClave = parseInt(cache.get('pwd_' + ses.dni) || '0', 10);
    if (cambioClave && ses.desde < cambioClave) { cache.remove('sess_' + token); return null; }
    cache.put('sess_' + token, raw, ttlSesion_());   // caducidad deslizante
    // Rol y estado se leen de la hoja, no del token: un cambio aplica en ≤2 min
    const u = usuarioPorDni_(ses.dni);
    if (!u) return null;
    // La empresa se lee de la hoja junto con el rol: moverla de empresa a
    // alguien cambia lo que ve en ≤2 min, sin que tenga que volver a entrar.
    return { token, dni: String(u.DNI), uuid: u.UUID, nombre: u.Nombre_Completo,
            rol: normalizarRol_(u.Rol), empresa: u.Empresa || '', bloqueado: esBloqueado_(u.Status) };
  }

  function cerrarSesion_(token) {
    if (token) CacheService.getScriptCache().remove('sess_' + token);
  }

  function intentosFallidos_(dni) { return parseInt(CacheService.getScriptCache().get('fail_' + dni) || '0', 10); }
  function registrarFallo_(dni) { CacheService.getScriptCache().put('fail_' + dni, String(intentosFallidos_(dni) + 1), 900); }
  function limpiarFallos_(dni) { CacheService.getScriptCache().remove('fail_' + dni); }

  function passwordInvalida_(p) {
    p = String(p == null ? '' : p);
    if (p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (p.length > 72) return 'La contraseña no puede superar 72 caracteres.';
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'La contraseña debe combinar letras y números.';
    return '';
  }

  /** SHA-256 hex de la contraseña: el mismo valor que calculaba la app antes. */
  function hashCliente_(password) {
    return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8));
  }

  /** v2$<sal>$<HMAC-SHA256 iterado>: con sal y lento, a diferencia del SHA-256 simple. */
  const RONDAS_HASH = 300;
  function hashPassword_(h, sal) {
    sal = sal || Utilities.getUuid().replace(/-/g, '');
    let x = String(h);
    for (let n = 0; n < RONDAS_HASH; n++) x = hex_(Utilities.computeHmacSha256Signature(x, sal));
    return 'v2$' + sal + '$' + x;
  }

  function verificarPassword_(h, guardado) {
    guardado = String(guardado || '');
    if (/^v2\$/.test(guardado)) {
      const partes = guardado.split('$');
      return iguales_(hashPassword_(h, partes[1]), guardado);
    }
    // Formato anterior: SHA-256 sin sal (se migra al entrar)
    return /^[0-9a-f]{64}$/i.test(guardado) && iguales_(guardado.toLowerCase(), String(h).toLowerCase());
  }

  function iguales_(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }


  // =========================================================================
  //  7. PERMISOS (mismas reglas que el RLS de Supabase)
  // =========================================================================
  function esAdmin_(s) { return !!s && (s.rol === 'admin' || s.rol === 'superadmin'); }

  // ── Empresa contratista ────────────────────────────────────────────────────
  // Un Admin o Supervisor con empresa asignada solo ve y escribe lo de su
  // empresa. El SuperAdmin (proveedor) ve todo; el Trabajador ya está limitado
  // a lo suyo por el alcance de su rol.

  /** Nombre de empresa normalizado para comparar ("A E S A " ≡ "aesa"). */
  function claveEmpresa_(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); }

  /** DNI → empresa, leído una sola vez por petición desde la hoja de usuarios. */
  function mapaEmpresas_() {
    if (_MEMO.empresas) return _MEMO.empresas;
    const mapa = {};
    try {
      const t = leerTabla_(hojaUsuarios_());
      const iDni = t.idx.DNI, iEmp = t.idx.Empresa;
      if (iDni !== undefined && iEmp !== undefined) {
        t.filas.forEach(f => {
          const d = String(celda_(f[iDni])).trim();
          if (d && mapa[d] === undefined) mapa[d] = celda_(f[iEmp]);
        });
      }
    } catch (e) { /* sin columna Empresa todavía */ }
    _MEMO.empresas = mapa;
    return mapa;
  }

  /**
  * ¿La fila es de la empresa de quien mira?
  *   · Sesión sin empresa → ve todo (así no se queda a ciegas una instalación
  *     anterior a este campo: asignar la empresa es lo que activa el filtro).
  *   · Fila sin Empresa (registro anterior) → se resuelve por la empresa actual
  *     de quien la creó; si tampoco la tiene, la ve cualquiera.
  */
  function mismaEmpresaUsuario_(s, u) {
    const mia = claveEmpresa_(s && s.empresa);
    if (!mia || (s && s.rol === 'superadmin')) return true;
    const suya = claveEmpresa_(u && u.Empresa);
    return !suya || suya === mia;
  }

  function mismaEmpresa_(s, id, fila) {
    const mia = claveEmpresa_(s && s.empresa);
    if (!mia) return true;
    const col = colEmpresa_(ESQUEMA.modulos[id]);
    const suya = claveEmpresa_(fila && fila[col]) ||
                claveEmpresa_(mapaEmpresas_()[String((fila && fila.Creado_Por_DNI) || '').trim()]);
    return !suya || suya === mia;
  }
  function matriz_(id, rol) { const m = ESQUEMA.modulos[id]; return m && m.roles && m.roles[rol]; }
  function esPropio_(s, fila) { return !!s.dni && String(fila.Creado_Por_DNI || '').trim() === s.dni; }
  function esResponsable_(s, id, fila) {
    const m = ESQUEMA.modulos[id];
    return !!s.dni && ((m && m.responsables) || []).some(c => String(fila[c] || '').trim() === s.dni);
  }

  /**
  * Plan + visibilidad por rol (mismo criterio que modulo_habilitado() en
  * Supabase): un módulo fuera del plan, u oculto por el Admin para este rol,
  * no se lee ni se escribe aunque se llame a la API directamente.
  */
  function moduloHabilitado_(s, id) {
    if (s.rol === 'superadmin') return true;
    const emp = _MEMO.empresa || (_MEMO.empresa = leerConfigEmpresa_());
    const plan = emp.modulos;
    if (plan && typeof plan === 'object' && Object.keys(plan).length && plan[id] !== true) return false;
    const vis = emp.config && emp.config.Modulos_Visibles;
    const v = vis && vis[id] ? vis[id][s.rol] : undefined;
    return v !== false && v !== 'false';
  }

  function puedeCrear_(s, id) {
    if (s.rol === 'superadmin') return true;
    if (!moduloHabilitado_(s, id)) return false;
    const r = matriz_(id, s.rol);
    return !!(r && r.crear);
  }

  function puedeLeer_(s, id, fila) {
    if (s.rol === 'superadmin') return true;
    if (!moduloHabilitado_(s, id)) return false;
    if (!mismaEmpresa_(s, id, fila)) return false;
    const r = matriz_(id, s.rol);
    if (!r || !r.leer) return false;
    if (s.rol === 'admin' || r.alcance === 'todos') return true;
    // Como en Supabase: lo que creó o donde figura (trabajador afectado, responsable…)
    return esPropio_(s, fila) || esResponsable_(s, id, fila);
  }

  /** accion: 'editar' | 'eliminar' */
  function puedeEscribir_(s, id, accion, fila) {
    if (s.rol === 'superadmin') return true;
    if (!moduloHabilitado_(s, id)) return false;
    if (!mismaEmpresa_(s, id, fila)) return false;
    const r = matriz_(id, s.rol);
    if (!r || !r[accion]) return false;
    if (r.alcance === 'todos') return true;
    if (r.alcance === 'responsable') return esPropio_(s, fila) || esResponsable_(s, id, fila);
    return esPropio_(s, fila);
  }

  function puedeVerArchivo_(s, modId, uuid) {
    if (s.rol === 'superadmin') return true;
    if (esModuloUsuarios_(modId)) {
      if (String(uuid) === String(s.uuid)) return true;
      if (s.rol !== 'admin' && s.rol !== 'supervisor') return false;
      const tu = leerTabla_(hojaUsuarios_());
      const iu = buscarFila_(tu, 'UUID', String(uuid));
      return iu >= 0 && mismaEmpresaUsuario_(s, filaAObjeto_(tu, tu.filas[iu]));
    }
    const m = ESQUEMA.modulos[modId];
    if (!m) return false;
    const fila = buscarRegistro_(m, String(uuid));
    return !!fila && puedeLeer_(s, modId, fila);
  }


  // =========================================================================
  //  8. CAPA DE HOJAS (Google Sheets)
  // =========================================================================
  const _MEMO = {};   // caché de una sola ejecución

  function libro_() {
    if (_MEMO.libro) return _MEMO.libro;
    const id = sheetId_();
    if (!id) throw errorUsuario_('El proyecto no está creado: ejecuta _CrearProyecto() en el editor de Apps Script.');
    _MEMO.libro = SpreadsheetApp.openById(id);
    return _MEMO.libro;
  }

  /** Lee una pestaña completa: { hoja, headers, idx, filas } (filas[i] = fila i+2). */
  function leerTabla_(nombre) {
    _MEMO.tablas = _MEMO.tablas || {};
    if (_MEMO.tablas[nombre]) return _MEMO.tablas[nombre];
    const hoja = libro_().getSheetByName(nombre);
    if (!hoja) throw errorUsuario_('Falta la pestaña "' + nombre + '". Ejecuta _CrearProyecto() para crearla.');
    const ult = hoja.getLastRow(), cols = hoja.getLastColumn();
    const valores = (ult >= 1 && cols >= 1) ? hoja.getRange(1, 1, ult, cols).getValues() : [[]];
    const headers = (valores[0] || []).map(h => String(h).trim());
    const idx = {};
    headers.forEach((h, i) => { if (h && idx[h] === undefined) idx[h] = i; });
    const t = { nombre, hoja, headers, idx, filas: valores.slice(1), mapas: {} };
    _MEMO.tablas[nombre] = t;
    return t;
  }

  function invalidarTabla_(nombre) { if (_MEMO.tablas) delete _MEMO.tablas[nombre]; }

  function buscarFila_(t, campo, valor) {
    const col = t.idx[campo];
    if (col === undefined || valor === '' || valor == null) return -1;
    if (!t.mapas[campo]) {
      const mapa = {};
      t.filas.forEach((f, i) => { const v = String(celda_(f[col])); if (v && mapa[v] === undefined) mapa[v] = i; });
      t.mapas[campo] = mapa;
    }
    const i = t.mapas[campo][String(valor)];
    return i === undefined ? -1 : i;
  }

  function filaAObjeto_(t, fila) {
    const o = {};
    t.headers.forEach((h, i) => { if (h) o[h] = celda_(fila[i]); });
    return o;
  }

  function objetoAFila_(t, obj, previa) {
    return t.headers.map((h, i) => (h && obj[h] !== undefined) ? textoSeguro_(obj[h]) : (previa ? previa[i] : ''));
  }

  function actualizarFila_(t, i, cambios) {
    const fila = objetoAFila_(t, cambios, t.filas[i]);
    const rango = t.hoja.getRange(i + 2, 1, 1, t.headers.length);
    rango.setNumberFormat('@');
    rango.setValues([fila]);
    t.filas[i] = fila.map(comoLaDevuelveSheets_);
    t.mapas = {};
  }

  function agregarFilas_(t, matriz) {
    if (!matriz.length) return;
    const inicio = Math.max(t.hoja.getLastRow(), 1) + 1;
    asegurarCapacidad_(t.hoja, inicio + matriz.length - 1, t.headers.length);
    const rango = t.hoja.getRange(inicio, 1, matriz.length, t.headers.length);
    // Texto plano: conserva ceros iniciales (DNI) y evita que Sheets convierta
    // fechas o interprete fórmulas
    rango.setNumberFormat('@');
    rango.setValues(matriz);
    matriz.forEach(f => t.filas.push(f.map(comoLaDevuelveSheets_)));
    t.mapas = {};
  }

  /** Borra filas de la hoja (números de fila 1-based) agrupando bloques contiguos. */
  function borrarFilas_(t, numeros) {
    if (!numeros.length) return;
    const orden = numeros.slice().sort((a, b) => b - a);
    const hoja = t.hoja;
    // Sheets no deja borrar TODAS las filas no inmovilizadas: se reserva una
    if (hoja.getMaxRows() - orden.length <= Math.max(hoja.getFrozenRows(), 1)) hoja.insertRowsAfter(hoja.getMaxRows(), 10);
    let fin = orden[0], ini = orden[0];
    for (let k = 1; k <= orden.length; k++) {
      if (k < orden.length && orden[k] === ini - 1) { ini = orden[k]; continue; }
      hoja.deleteRows(ini, fin - ini + 1);
      if (k < orden.length) { fin = orden[k]; ini = orden[k]; }
    }
    invalidarTabla_(t.nombre);
  }

  function asegurarCapacidad_(hoja, filas, columnas) {
    const maxR = hoja.getMaxRows(), maxC = hoja.getMaxColumns();
    if (filas > maxR) hoja.insertRowsAfter(maxR, Math.max(filas - maxR, 200));
    if (columnas > maxC) hoja.insertColumnsAfter(maxC, columnas - maxC);
  }

  /** Valor de celda → texto (las fechas que alguien escribió a mano se normalizan). */
  function celda_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      const conHora = v.getHours() || v.getMinutes() || v.getSeconds();
      return Utilities.formatDate(v, CONFIG.TIMEZONE, conHora ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
    }
    return (typeof v === 'string') ? v : String(v);
  }

  function valorTexto_(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /**
  * Un texto que empieza por = + @ sería una FÓRMULA al abrir la hoja (p. ej.
  * =IMPORTXML que envía datos a un tercero). Se antepone ' para guardarlo
  * como texto literal.
  */
  function textoSeguro_(v) {
    const s = valorTexto_(v);
    return /^[=+@]/.test(s) || /^-[^\d.\s]/.test(s) ? "'" + s : s;
  }

  /** El apóstrofo protector no forma parte del valor: Sheets lo devuelve sin él. */
  function comoLaDevuelveSheets_(v) {
    return (typeof v === 'string' && /^'[=+@-]/.test(v)) ? v.slice(1) : v;
  }

  // ── Configuración de la empresa (_CONFIG) y auditoría ──────────────────────
  const HOJA_CONFIG = '_CONFIG';
  const HOJA_AUDITORIA = '_AUDITORIA';

  function leerConfigEmpresa_() {
    const out = {};
    try {
      const t = leerTabla_(HOJA_CONFIG);
      t.filas.forEach(f => {
        const k = String(celda_(f[t.idx.Clave] )).trim();
        if (!k) return;
        const v = celda_(f[t.idx.Valor]);
        try { out[k] = /^[\[{]/.test(v) ? JSON.parse(v) : v; } catch (e) { out[k] = v; }
      });
    } catch (e) { /* sin _CONFIG todavía */ }
    return out;
  }

  function escribirConfig_(clave, valor) {
    const t = leerTabla_(HOJA_CONFIG);
    const i = buscarFila_(t, 'Clave', clave);
    const o = { Clave: clave, Valor: valor, Actualizado_En: ahora_() };
    if (i >= 0) actualizarFila_(t, i, o); else agregarFilas_(t, [objetoAFila_(t, o)]);
  }

  function auditar_(dni, accion, modulo, uuid, detalle) {
    (_MEMO.auditoria = _MEMO.auditoria || []).push([ahora_(), dni || '', accion, modulo || '', uuid || '', String(detalle || '').slice(0, 500)]);
  }

  /** Escribe la auditoría acumulada en una sola operación. */
  function vaciarAuditoria_(conLock) {
    const filas = _MEMO.auditoria || [];
    if (!filas.length) return;
    _MEMO.auditoria = [];
    let lock = null;
    try {
      if (!conLock) { lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return; }
      const t = leerTabla_(HOJA_AUDITORIA);
      agregarFilas_(t, filas.map(f => objetoAFila_(t, { Fecha: f[0], DNI: f[1], Accion: f[2], Modulo: f[3], UUID: f[4], Detalle: f[5] })));
    } catch (e) { console.warn('Auditoría no escrita: ' + e); }
    finally { if (lock) lock.releaseLock(); }
  }


  // =========================================================================
  //  9. ARCHIVOS (Google Drive)
  // =========================================================================
  const MIME_PERMITIDOS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'text/csv': 'csv', 'text/plain': 'txt',
    'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
  };

  /**
  * Campos de archivo: cada dataURL nuevo se sube a DATA/<módulo>/<fecha>/ y
  * el valor guardado pasa a ser "drive:<id>/<nombre>". Un campo vacío al
  * editar NO borra la evidencia anterior; en galerías las fotos se acumulan.
  */
  function procesarArchivos_(m, modId, uuid, nuevo, previo) {
    (m.archivos || []).forEach(campo => {
      if (!(campo in nuevo)) return;
      const partes = partirListaMedia_(nuevo[campo]);
      const previas = previo ? partirListaMedia_(previo[campo]) : [];
      if (!partes.length) {
        if (previo && previas.length) { delete nuevo[campo]; delete nuevo[campo + '_ID']; delete nuevo[campo + '_Path']; }
        return;
      }
      const refs = [], rutas = [];
      partes.forEach((p, n) => {
        if (/^data:/i.test(p)) {
          const a = guardarArchivo_(modId, uuid, campo, p, n);
          refs.push(a.ref); rutas.push(a.ruta);
        } else if (/^drive:/i.test(p) || /^https:\/\//i.test(p)) {
          refs.push(p);
        }
        // cualquier otro valor (javascript:, rutas sueltas…) se descarta
      });
      const coleccion = m.tipos[campo] === 'Image_Collection';
      const final = coleccion ? unicos_(previas.concat(refs)) : refs;
      nuevo[campo] = final.join(',');
      if (m.campos.indexOf(campo + '_ID') !== -1) nuevo[campo + '_ID'] = final.map(idDeRef_).filter(Boolean).join(',');
      if (m.campos.indexOf(campo + '_Path') !== -1) {
        const prevRutas = (coleccion && previo) ? String(previo[campo + '_Path'] || '').split(',').filter(Boolean) : [];
        if (rutas.length || !coleccion) nuevo[campo + '_Path'] = prevRutas.concat(rutas).join(',');
      }
    });
  }

  function guardarArchivo_(modId, uuid, campo, dataUrl, n) {
    const m = /^data:([\w.+-]+\/[\w.+-]+)(;[\w-]+=[^;,]+)*;base64,(.*)$/i.exec(String(dataUrl));
    if (!m) throw errorUsuario_('Archivo inválido en ' + campo + '.');
    const mime = m[1].toLowerCase();
    const ext = MIME_PERMITIDOS[mime];
    if (!ext) throw errorUsuario_('Tipo de archivo no permitido en ' + campo + ': ' + mime);
    const bytes = Utilities.base64Decode(m[3]);
    if (bytes.length > (CONFIG.MAX_FILE_MB || 10) * 1024 * 1024) throw errorUsuario_('El archivo de ' + campo + ' supera ' + CONFIG.MAX_FILE_MB + ' MB.');
    const sello = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
    const nombre = campo + '_' + n + '_' + String(uuid).replace(/[^\w-]/g, '').slice(0, 36) + '_' + sello + '.' + ext;
    const destino = carpetaDelDia_(modId);
    const file = destino.carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
    // La descripción permite comprobar, al servirlo, a qué registro pertenece
    file.setDescription(['MOTOR', modId, uuid, campo].join('|'));
    return { id: file.getId(), ref: 'drive:' + file.getId() + '/' + nombre, ruta: destino.ruta + '/' + nombre };
  }

  function carpetaRaiz_() {
    const id = rootId_();
    if (!id) throw errorUsuario_('Falta CONFIG.ROOT_FOLDER_ID (carpeta raíz de Drive).');
    return DriveApp.getFolderById(id);
  }

  function carpetaData_() {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('MOTOR_DATA_FOLDER_ID');
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
    const f = subcarpeta_(carpetaRaiz_(), CONFIG.DATA_FOLDER_NAME || 'DATA');
    props.setProperty('MOTOR_DATA_FOLDER_ID', f.getId());
    return f;
  }

  /** DATA/<módulo>/<subcarpetas según DATE_FOLDER_PATTERN>, creadas al vuelo. */
  function carpetaDelDia_(modId) {
    const segs = String(CONFIG.DATE_FOLDER_PATTERN || '').split('/')
      .map(p => p.trim()).filter(Boolean)
      .map(p => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, p));
    const ruta = [CONFIG.DATA_FOLDER_NAME || 'DATA', modId].concat(segs).join('/');
    const cache = CacheService.getScriptCache();
    const enCache = cache.get('dir_' + ruta);
    if (enCache) { try { return { carpeta: DriveApp.getFolderById(enCache), ruta }; } catch (e) {} }
    let f = subcarpeta_(carpetaData_(), modId);
    segs.forEach(s => { f = subcarpeta_(f, s); });
    cache.put('dir_' + ruta, f.getId(), 21600);
    return { carpeta: f, ruta };
  }

  function subcarpeta_(padre, nombre) {
    const it = padre.getFoldersByName(nombre);
    return it.hasNext() ? it.next() : padre.createFolder(nombre);
  }

  /** "drive:<id>/<nombre>", URL de Drive o ID suelto → ID del archivo. */
  function idDeRef_(ref) {
    const s = String(ref || '').trim();
    let m = /^drive:([-\w]{20,})/i.exec(s);
    if (m) return m[1];
    m = /\/d\/([-\w]{20,})/.exec(s) || /[?&]id=([-\w]{20,})/.exec(s);
    if (m) return m[1];
    return /^[-\w]{25,}$/.test(s) ? s : '';
  }

  /** Igual que partirListaMedia() de la app: un dataURL lleva una coma interna. */
  function partirListaMedia_(valor) {
    return (String(valor || '').match(/data:[^,]*,[^,]*|[^,]+/g) || []).map(s => s.trim()).filter(Boolean);
  }

  function unicos_(lista) {
    const visto = {};
    return lista.filter(x => (visto[x] ? false : (visto[x] = true)));
  }


  // =========================================================================
  //  10. CREACIÓN Y VERIFICACIÓN DEL PROYECTO
  // =========================================================================
  const PROP_SHEET = 'MOTOR_SPREADSHEET_ID';
  const PROP_ROOT  = 'MOTOR_ROOT_FOLDER_ID';

  function idDe_(valor) {
    const s = String(valor || '').trim();
    if (!s || /^PEGAR_AQUI/i.test(s)) return '';
    const m = s.match(/[-\w]{25,}/);
    return m ? m[0] : s;
  }
  function rootId_()  { return idDe_(CONFIG.ROOT_FOLDER_ID) || PropertiesService.getScriptProperties().getProperty(PROP_ROOT) || ''; }
  function sheetId_() { return idDe_(CONFIG.SPREADSHEET_ID) || PropertiesService.getScriptProperties().getProperty(PROP_SHEET) || ''; }

  /** Todas las pestañas que necesita el proyecto, con sus encabezados. */
  function especHojas_() {
    const lista = [{ nombre: ESQUEMA.usuarios.hoja, headers: ESQUEMA.usuarios.campos, tipo: 'usuarios' }];
    Object.keys(ESQUEMA.modulos).forEach(id => {
      const m = ESQUEMA.modulos[id];
      lista.push({ nombre: m.hoja, headers: m.campos, tipo: 'modulo', modulo: id });
      if (m.hojaHija) lista.push({ nombre: m.hojaHija, headers: ['PARENT_UUID'].concat(m.camposHijo, ['Creado_En']), tipo: 'hija', modulo: id });
    });
    lista.push({ nombre: HOJA_CONFIG, headers: ['Clave', 'Valor', 'Actualizado_En'], tipo: 'sistema' });
    lista.push({ nombre: HOJA_AUDITORIA, headers: ['Fecha', 'DNI', 'Accion', 'Modulo', 'UUID', 'Detalle'], tipo: 'sistema' });
    return lista;
  }

  function crearProyecto_() {
    const L = [];
    const props = PropertiesService.getScriptProperties();
    if (!Object.keys(ESQUEMA.modulos).length) {
      throw new Error('El ESQUEMA está vacío: genera Code.gs con "node tools/gen_appscript.js" antes de pegarlo.');
    }

    // 1. Carpeta raíz (CONFIG, propiedad guardada o se pide)
    let raizId = rootId_();
    if (!raizId) raizId = pedirDato_('ID o URL de la carpeta raíz de Drive', 'Ahí se guardarán la Sheet y la carpeta DATA.');
    if (!raizId) throw new Error('Completa CONFIG.ROOT_FOLDER_ID (ID o URL de la carpeta de Drive) y vuelve a ejecutar _CrearProyecto.');
    const raiz = DriveApp.getFolderById(raizId);
    props.setProperty(PROP_ROOT, raizId);
    L.push('📁 Carpeta raíz: ' + raiz.getName());

    // 2. Google Sheet (dentro de la carpeta raíz)
    let ss, idSheet = sheetId_();
    // Script vinculado a una Sheet (Extensiones → Apps Script): esa es la base
    if (!idSheet) {
      try { const activa = SpreadsheetApp.getActiveSpreadsheet(); if (activa) idSheet = activa.getId(); } catch (e) {}
    }
    if (!idSheet && !idDe_(CONFIG.SPREADSHEET_ID)) {
      const pedido = pedirDato_('ID o URL de la Google Sheet (vacío = crear una nueva)', 'Si la dejas vacía se crea dentro de la carpeta raíz.');
      if (pedido) idSheet = pedido;
    }
    if (idSheet) {
      ss = SpreadsheetApp.openById(idSheet);
      L.push('📊 Sheet existente: ' + ss.getName());
    } else {
      ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
      L.push('➕ Sheet creada: ' + ss.getName());
    }
    props.setProperty(PROP_SHEET, ss.getId());
    _MEMO.libro = ss;
    const archivoSheet = DriveApp.getFileById(ss.getId());
    if (!enCarpeta_(archivoSheet, raiz)) {
      archivoSheet.moveTo(raiz);
      L.push('↪️  Sheet movida a la carpeta raíz');
    }
    try { ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE); } catch (e) {}

    // 3. Pestañas y encabezados
    const hojaInicial = ss.getSheets()[0];
    especHojas_().forEach(e => {
      let hoja = ss.getSheetByName(e.nombre);
      const nueva = !hoja;
      if (!hoja) hoja = ss.insertSheet(e.nombre);
      const existentes = hoja.getLastColumn() ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim()) : [];
      const faltan = e.headers.filter(h => existentes.indexOf(h) === -1);
      if (faltan.length) {
        const desde = existentes.filter(Boolean).length ? hoja.getLastColumn() + 1 : 1;
        const todos = desde === 1 ? e.headers : faltan;
        asegurarCapacidad_(hoja, 2, desde + todos.length - 1);
        hoja.getRange(1, desde, 1, todos.length).setValues([todos]);
      }
      const nCols = Math.max(hoja.getLastColumn(), e.headers.length);
      hoja.getRange(1, 1, 1, nCols).setFontWeight('bold').setBackground('#162138').setFontColor('#ffffff');
      hoja.setFrozenRows(1);
      // Columnas de datos en texto plano: DNI con ceros, fechas tal cual
      if (hoja.getMaxRows() > 1) hoja.getRange(2, 1, hoja.getMaxRows() - 1, nCols).setNumberFormat('@');
      L.push((nueva ? '➕ Pestaña ' : (faltan.length ? '🔧 Pestaña ' : '✔ Pestaña ')) + e.nombre +
            (faltan.length && !nueva ? ' (+' + faltan.length + ' columnas: ' + faltan.join(', ') + ')' : ''));
    });
    // La "Hoja 1" vacía que trae toda Sheet nueva
    if (hojaInicial && ss.getSheets().length > 1 && especHojas_().every(e => e.nombre !== hojaInicial.getName()) &&
        hojaInicial.getLastRow() === 0) {
      ss.deleteSheet(hojaInicial);
    }

    // 4. Carpetas DATA/<módulo>
    const data = subcarpeta_(raiz, CONFIG.DATA_FOLDER_NAME || 'DATA');
    props.setProperty('MOTOR_DATA_FOLDER_ID', data.getId());
    const modulos = [ESQUEMA.usuarios.id].concat(Object.keys(ESQUEMA.modulos));
    modulos.forEach(id => subcarpeta_(data, id));
    L.push('📁 ' + (CONFIG.DATA_FOLDER_NAME || 'DATA') + '/ con ' + modulos.length + ' carpetas de módulo (archivos por fecha: ' +
          (CONFIG.DATE_FOLDER_PATTERN || 'sin subcarpetas') + ')');

    // 5. Configuración base
    invalidarTabla_(HOJA_CONFIG);
    const cfg = leerConfigEmpresa_();
    if (!cfg.empresa_nombre) escribirConfig_('empresa_nombre', CONFIG.EMPRESA_NOMBRE);
    escribirConfig_('esquema', ESQUEMA.version);
    escribirConfig_('version_backend', CONFIG.APP_VERSION);

    // 6. Primer administrador
    invalidarTabla_(hojaUsuarios_());
    const tu = leerTabla_(hojaUsuarios_());
    const hayUsuarios = tu.filas.some(f => String(f[tu.idx.DNI] || '').trim());
    if (!hayUsuarios) {
      const a = CONFIG.ADMIN_INICIAL || {};
      const err = passwordInvalida_(a.PASSWORD);
      if (err) throw new Error('CONFIG.ADMIN_INICIAL.PASSWORD: ' + err);
      const ahora = ahora_();
      agregarFilas_(tu, [objetoAFila_(tu, {
        UUID: Utilities.getUuid(), DNI: String(a.DNI), Nombre_Completo: a.NOMBRE || 'Administrador',
        Email: a.EMAIL || '', Rol: 'Admin', Status: 'Activo',
        Password_Hash: hashPassword_(hashCliente_(String(a.PASSWORD))), Creado_En: ahora, Actualizado_En: ahora
      })]);
      L.push('👤 Administrador inicial creado — DNI: ' + a.DNI + ' · contraseña: la de CONFIG.ADMIN_INICIAL (cámbiala al entrar)');
    } else {
      L.push('👤 Usuarios existentes: ' + tu.filas.filter(f => String(f[tu.idx.DNI] || '').trim()).length + ' (no se creó administrador)');
    }
    auditar_('sistema', 'CREAR_PROYECTO', '', '', ESQUEMA.version);
    vaciarAuditoria_(false);

    L.push('', '✅ Listo. Siguiente paso: Implementar → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona)',
          '   y después ejecuta _VerificarProyecto.', '', '🔗 Sheet: ' + ss.getUrl(), '🔗 DATA:  ' + data.getUrl());
    return { lineas: L, sheetUrl: ss.getUrl(), dataUrl: data.getUrl() };
  }

  /**
  * Lista de comprobaciones [{grupo, nombre, estado: ok|warn|error, detalle}].
  * La usan _VerificarProyecto (editor) y la acción VERIFICAR_PROYECTO (panel
  * de administración de la app).
  */
  function verificarEstructura_(opts) {
    opts = opts || {};
    const C = [];
    const add = (grupo, nombre, estado, detalle) => C.push({ grupo, nombre, estado, detalle: detalle || '' });

    add('backend', 'Backend Apps Script', 'ok', 'versión ' + CONFIG.APP_VERSION + ' · esquema ' + ESQUEMA.version);
    if (!Object.keys(ESQUEMA.modulos).length) add('backend', 'Esquema de módulos', 'error', 'vacío: genera Code.gs con node tools/gen_appscript.js');

    // Carpeta raíz
    let raiz = null;
    if (!rootId_()) add('drive', 'Carpeta raíz', 'error', 'falta CONFIG.ROOT_FOLDER_ID');
    else {
      try { raiz = DriveApp.getFolderById(rootId_()); add('drive', 'Carpeta raíz', 'ok', raiz.getName()); }
      catch (e) { add('drive', 'Carpeta raíz', 'error', 'sin acceso: ' + e.message); }
    }

    // Sheet
    let ss = null;
    if (!sheetId_()) add('sheet', 'Google Sheet', 'error', 'no existe todavía: ejecuta _CrearProyecto');
    else {
      try {
        ss = libro_();
        add('sheet', 'Google Sheet', 'ok', ss.getName());
        if (raiz && !enCarpeta_(DriveApp.getFileById(ss.getId()), raiz)) add('sheet', 'Ubicación de la Sheet', 'warn', 'no está dentro de la carpeta raíz');
      } catch (e) { add('sheet', 'Google Sheet', 'error', 'sin acceso: ' + e.message); }
    }

    // Pestañas y encabezados
    if (ss) {
      let faltanHojas = 0, faltanCols = 0;
      especHojas_().forEach(e => {
        const hoja = ss.getSheetByName(e.nombre);
        if (!hoja) { faltanHojas++; add('sheet', 'Pestaña ' + e.nombre, 'error', 'no existe'); return; }
        const hs = hoja.getLastColumn() ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim()) : [];
        const faltan = e.headers.filter(h => hs.indexOf(h) === -1);
        if (faltan.length) { faltanCols += faltan.length; add('sheet', 'Pestaña ' + e.nombre, 'error', 'faltan columnas: ' + faltan.join(', ')); }
      });
      if (!faltanHojas && !faltanCols) add('sheet', 'Pestañas y encabezados', 'ok', especHojas_().length + ' pestañas completas');
      else add('sheet', 'Reparación', 'warn', 'ejecuta _CrearProyecto: añade lo que falta sin borrar datos');
    }

    // Carpetas
    if (raiz) {
      const it = raiz.getFoldersByName(CONFIG.DATA_FOLDER_NAME || 'DATA');
      if (!it.hasNext()) add('drive', 'Carpeta ' + (CONFIG.DATA_FOLDER_NAME || 'DATA'), 'error', 'no existe');
      else {
        const data = it.next();
        const modulos = [ESQUEMA.usuarios.id].concat(Object.keys(ESQUEMA.modulos));
        const faltan = modulos.filter(id => !data.getFoldersByName(id).hasNext());
        add('drive', 'Carpetas de módulos', faltan.length ? 'warn' : 'ok',
            faltan.length ? 'faltan: ' + faltan.join(', ') + ' (se crean solas al subir el primer archivo)' : modulos.length + ' carpetas');
        if (opts.escritura) {
          try {
            const f = data.createFile(Utilities.newBlob('prueba de escritura MOTOR', 'text/plain', '_prueba_motor.txt'));
            f.setTrashed(true);
            add('drive', 'Escritura en Drive', 'ok', 'se creó y eliminó un archivo de prueba');
          } catch (e) { add('drive', 'Escritura en Drive', 'error', e.message); }
        }
      }
    }

    // Usuarios
    if (ss && ss.getSheetByName(hojaUsuarios_())) {
      const t = leerTabla_(hojaUsuarios_());
      const us = t.filas.map(f => filaAObjeto_(t, f)).filter(u => u.DNI);
      const admins = us.filter(u => ['admin', 'superadmin'].indexOf(normalizarRol_(u.Rol)) !== -1 && !esBloqueado_(u.Status));
      add('usuarios', 'Usuarios', us.length ? 'ok' : 'error', us.length + ' cuenta(s)');
      add('usuarios', 'Administrador activo', admins.length ? 'ok' : 'error', admins.length ? admins.length + ' administrador(es)' : 'ninguno: nadie podrá gestionar la app');
      const antiguos = us.length - t.filas.filter(f => /^v2\$/.test(String(f[t.idx.Password_Hash] || ''))).length;
      if (antiguos > 0) add('usuarios', 'Contraseñas', 'warn', antiguos + ' con hash antiguo: se protegen solas en su próximo inicio de sesión');
    }

    // Zona horaria y aplicación web
    try {
      const tz = Session.getScriptTimeZone();
      add('backend', 'Zona horaria del script', tz === CONFIG.TIMEZONE ? 'ok' : 'warn',
          tz === CONFIG.TIMEZONE ? tz : tz + ' (se recomienda ' + CONFIG.TIMEZONE + ' en Configuración del proyecto)');
    } catch (e) {}
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
    if (!url) add('web', 'Aplicación web', opts.red ? 'error' : 'warn', 'no implementada: Implementar → Nueva implementación → Aplicación web');
    else {
      const esDev = /\/dev(\?|$)/.test(url);
      add('web', 'URL de la aplicación web', esDev ? 'warn' : 'ok',
          esDev ? url + ' es la URL de PRUEBAS (solo tú). La app necesita la URL /exec: Implementar → Gestionar implementaciones'
                : url);
      if (opts.red) {
        try {
          const op = { muteHttpExceptions: true, followRedirects: true };
          if (esDev) op.headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
          const r = UrlFetchApp.fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 'accion=ping', op);
          let ok = false;
          try { ok = JSON.parse(r.getContentText()).status === 'OK'; } catch (e) { ok = false; }
          add('web', 'Conectividad de la app', ok ? (esDev ? 'warn' : 'ok') : 'error',
              ok ? (esDev ? 'el código responde; falta usar la URL /exec en la app'
                          : 'la URL responde sin iniciar sesión en Google: úsala como APPS_SCRIPT_URL')
                : 'HTTP ' + r.getResponseCode() + ' — en la implementación, "Quién tiene acceso" debe ser "Cualquier persona"');
        } catch (e) { add('web', 'Conectividad de la app', 'error', e.message); }
      }
    }
    return C;
  }

  function enCarpeta_(archivo, carpeta) {
    const it = archivo.getParents();
    while (it.hasNext()) { if (it.next().getId() === carpeta.getId()) return true; }
    return false;
  }

  /** Solo el dueño del proyecto (desde el editor), nunca un visitante de la app web. */
  function soloPropietario_() {
    let activo = '', efectivo = '';
    try { activo = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
    try { efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
    if (!activo || activo !== efectivo) {
      throw new Error('Esta función solo la ejecuta el propietario del proyecto desde el editor de Apps Script.');
    }
  }

  function pedirDato_(titulo, ayuda) {
    try {
      const ui = SpreadsheetApp.getUi();
      const r = ui.prompt(titulo, ayuda || '', ui.ButtonSet.OK_CANCEL);
      if (r.getSelectedButton() === ui.Button.OK) return idDe_(r.getResponseText());
      return '';
    } catch (e) { /* proyecto independiente: no hay ventana de diálogo */ }
    return '';
  }

  function avisarEnUi_(titulo, texto) {
    try { SpreadsheetApp.getUi().alert(titulo, texto, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* sin UI */ }
  }


  // =========================================================================
  //  11. CORREO POR PLANTILLA (EMAIL_TEMPLATE_ID del subconfig)
  // =========================================================================
  function enviarCorreoSeguro_(m, registro, hijos) {
    try {
      const destino = String(registro.Email || registro.Email_Notificacion || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return;
      let cuerpo = DocumentApp.openById(m.emailTemplateId).getBody().getText();
      Object.keys(registro).forEach(k => { cuerpo = cuerpo.split('<<[' + k + ']>>').join(String(registro[k] || '')); });
      if (hijos.length) {
        cuerpo = cuerpo.split('<<[TABLA_HIJA]>>').join('\n--- DETALLE ---\n' +
          hijos.map((h, i) => '[' + (i + 1) + '] ' + Object.keys(h).map(k => h[k]).join(' | ')).join('\n'));
      }
      MailApp.sendEmail({ to: destino, subject: 'Notificación ' + m.hoja + ' · ' + (registro.UUID || ''), body: cuerpo });
    } catch (e) { console.warn('Correo no enviado (' + m.hoja + '): ' + e.message); }
  }


  // =========================================================================
  //  12. UTILIDADES
  // =========================================================================
  function errorUsuario_(msg) { const e = new Error(msg); e.usuario = true; return e; }
  function ahora_() { return new Date().toISOString(); }
  function hex_(bytes) { return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join(''); }
  function respuestaJson_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
