const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const indexPath = path.join(rootDir, '00_Config', 'Index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

const includeRegex = /<\?!= include\(['"]([^'"]+)['"]\);? \?>/g;

indexContent = indexContent.replace(includeRegex, (match, filename) => {
    let filePath = path.join(rootDir, filename);
    
    // Check with .html immediately
    const checkFile = (p) => fs.existsSync(p) ? p : (fs.existsSync(p + '.html') ? p + '.html' : null);

    let resolvedPath = checkFile(filePath);
    if (!resolvedPath) {
        // Fallback to 00_Config
        resolvedPath = checkFile(path.join(rootDir, '00_Config', filename));
    }
    
    if (resolvedPath) {
        console.log(`Injecting: ${filename} -> ${path.basename(resolvedPath)}`);
        return fs.readFileSync(resolvedPath, 'utf8');
    } else {
        console.warn(`Warning: File not found ${filename}`);
        return `<!-- ERROR: ${filename} not found -->`;
    }
});

// Inyectar Mock de google.script.run
const mockScript = `
<script>
// Vista previa local: habilita el usuario demo (admin/admin123). En un
// despliegue real esta marca no existe y el demo no se crea.
window.__MOTOR_DEMO__ = true;
window.google = {
  script: {
    run: {
      withSuccessHandler: function(successCb) {
        const chain = {
          withFailureHandler: function(_failCb) { return chain; },
          serverRouter: function(request) {
            const req = JSON.parse(request);
            console.log("MOCK BACKEND CALLED:", req);

            const SUBCONFIG_TEMAS_MOCK = [
              "Inspección de herramientas antes de usarlas",
              "Uso correcto del arnés de seguridad",
              "Orden y limpieza en el puesto de trabajo",
              "Levantamiento manual de cargas",
              "Reporte de actos y condiciones subestándar",
              "Hidratación y golpe de calor"
            ];
            let payload = [];
            const action = req.action;
            const module = req.moduleName || req.module;

            if (action === "LOGIN_AUTH") {
                if (req.userDNI === 'admin') {
                    setTimeout(() => successCb(JSON.stringify({
                        status: 'OK',
                        userData: {
                            UUID: 'USR-admin',
                            DNI: 'admin',
                            Nombre_Completo: 'Administrador Sistema',
                            Email: 'admin@empresa.com',
                            Rol: 'Admin',
                            Status: 'Activo',
                            SessionToken: 'mock-token-' + Date.now()
                        },
                        msg: 'Login exitoso (mock)'
                    })), 500);
                } else {
                    setTimeout(() => successCb(JSON.stringify({
                        status: 'ERROR',
                        msg: 'Use DNI: admin con cualquier contraseña en modo demo'
                    })), 500);
                }
                return;
            }
            if (action === "read_all" || action === "read" || action === "READ_DB" || action === "read_db") {
                for (let i = 1; i <= 30; i++) {
                    if (module === "01_Usuarios") {
                        payload.push({
                            UUID: "USR-"+i, DNI: "1000"+i, Nombre_Completo: "Usuario Demo " + i,
                            Email: "demo"+i+"@empresa.com",
                            Rol: (i % 3 === 0 ? "Admin" : i % 5 === 0 ? "Supervisor" : "Trabajador"),
                            Status: (i === 5 ? "Cesado" : "Activo")
                        });
                    } else if (module === "02_Reportes") {
                        payload.push({
                            UUID: "REP-"+i, Fecha_Emision: "2026-04-" + (i < 10 ? "0"+i : i),
                            Inspector_DNI: "776655"+i, Categoria_Reporte: (i % 2 === 0 ? "Preventivo" : "Condición Crítica"),
                            Nivel_Severidad: (i % 4 === 0 ? "Alto (Rojo)" : "Bajo (Verde)")
                        });
                    } else if (module === "10_Charlas") {
                        const pz = n => String(n).padStart(2,'0');
                        const fl = d => d.getFullYear() + '-' + pz(d.getMonth()+1) + '-' + pz(d.getDate());
                        // Peru = UTC-5: la fecha "de hoy" debe calcularse en local
                        const hoyPeru = new Date(Date.now() - 5*3600000);
                        // Las primeras 3 son de hoy y cubren 3 de las 5 áreas con cobertura
                        const dia = i <= 3 ? new Date(hoyPeru) : new Date(hoyPeru.getTime() - (i-2) * 86400000);
                        const areasHoy = ["Operaciones","Mantenimiento","Producción"];
                        const temas = SUBCONFIG_TEMAS_MOCK;
                        payload.push({
                            UUID: "CHL-" + (900 + i),
                            Tema: temas[i % temas.length],
                            Categoria: ["Riesgos del día","Uso de EPP","Orden y limpieza","Herramientas manuales","Emergencias"][i % 5],
                            Fecha: fl(dia),
                            Hora: ["07:00","07:15","14:00","19:30","06:45"][i % 5],
                            Turno: i <= 3 ? "Día" : ["Día","Tarde","Noche"][i % 3],
                            Area: i <= 3 ? areasHoy[i - 1] : ["Operaciones","Mantenimiento","Almacén","Producción","Obra / Campo"][i % 5],
                            Lugar: "Punto de encuentro " + (1 + (i % 3)),
                            Expositor_DNI: "8765432" + (i % 10),
                            Expositor: ["Ana Quispe","Luis Paredes","Carlos Mendoza","María Torres","José Huanca"][i % 5],
                            Duracion_Min: "5",
                            Puntos_Tratados: "Se revisaron los riesgos de la jornada y las medidas de control aplicables.",
                            Compromisos: "Reportar toda condición subestándar antes de iniciar la tarea.",
                            Estado: "Ejecutada",
                            Total_Asistentes: String(6 + (i % 12))
                        });
                    } else if (module === "09_EPP") {
                        const p2e = n => String(n).padStart(2,'0');
                        const fl = d => d.getFullYear() + '-' + p2e(d.getMonth()+1) + '-' + p2e(d.getDate());
                        // Entregas repartidas para cubrir reposición vencida / próxima / al día
                        const ent = new Date(Date.now() - [400, 200, 340, 100, 20][i % 5] * 86400000);
                        const vida = [12, 6, 12, 24, 24][i % 5];
                        const rep = new Date(ent); rep.setMonth(rep.getMonth() + vida);
                        payload.push({
                            UUID: "EPP-" + (400 + i),
                            Trabajador_DNI: "1000" + i,
                            Nombre_Trabajador: "Usuario Demo " + i,
                            Area: ["Operaciones","Mantenimiento","Almacén","Producción","Obra / Campo"][i % 5],
                            Puesto: ["Operario","Técnico","Almacenero","Supervisor","Ayudante"][i % 5],
                            Tipo_Entrega: ["Dotación inicial","Reposición por vida útil","Reposición por desgaste","Reposición por daño","Cambio de puesto"][i % 5],
                            Fecha_Entrega: fl(ent),
                            Entregado_Por: "8765432" + (i % 10),
                            Estado: (i % 4 === 0 ? "Pendiente de firma" : "Entregado"),
                            Total_Items: String(2 + (i % 5)),
                            Proxima_Reposicion: fl(rep),
                            Firma_Trabajador: (i % 4 === 0 ? "" : "https://placehold.co/300x120?text=Firma"),
                            Observaciones: "Entrega conforme al procedimiento de dotación."
                        });
                    } else if (module === "08_PETAR") {
                        const tipos = ["Trabajo en altura","Espacio confinado","Trabajo en caliente","Izaje crítico","Trabajo eléctrico"];
                        const ests  = ["Aprobado","Solicitado","En ejecución","Cerrado","Aprobado"];
                        // Repartidos para cubrir vigente / programado / vencido sin cerrar / cerrado
                        const hoy = new Date();
                        const dia = new Date(hoy.getTime() + [0, 0, -1, -3, 1][i % 5] * 86400000);
                        const p2 = n => String(n).padStart(2,'0');
                        // Ventanas en MINUTOS desde medianoche: con horas enteras,
                        // cerca de las 23:00 la ventana "vigente" caía fuera del día.
                        const min = hoy.getHours() * 60 + hoy.getMinutes();
                        const hhmm = m => p2(Math.floor(Math.min(1439, Math.max(0, m)) / 60)) + ':' +
                                          p2(Math.min(1439, Math.max(0, m)) % 60);
                        const ventanas = [
                            [min - 60,  Math.min(1439, min + 180)],  // vigente ahora
                            [Math.min(1380, min + 120), Math.min(1439, min + 300)], // programado
                            [420, 900], [480, 1020], [360, 840]
                        ];
                        const [mi, mf] = ventanas[i % 5];
                        // Fecha LOCAL: toISOString daría la fecha UTC y desalinearía
                        // el día respecto a las horas, que sí son locales.
                        const fechaLocal = d => d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate());
                        payload.push({
                            UUID: "PTR-" + (500 + i),
                            Tipo_Trabajo: tipos[i % 5],
                            Descripcion: "Ejecución de " + tipos[i % 5].toLowerCase() + " según procedimiento aprobado.",
                            Area: ["Mantenimiento","Producción","Obra / Campo","Almacén","Operaciones"][i % 5],
                            Lugar_Especifico: "Sector " + String.fromCharCode(65 + (i % 5)) + " nivel " + (1 + i % 3),
                            Fecha: fechaLocal(dia),
                            Hora_Inicio: hhmm(mi), Hora_Fin: hhmm(mf),
                            Empresa: (i % 3 === 0 ? "Contratista Andina SAC" : "Propia"),
                            Num_Trabajadores: String(2 + (i % 6)),
                            Ejecutante_DNI: "1000" + i, Supervisor_DNI: "8765432" + (i % 10),
                            IPERC_Referencia: "IPC-" + (600 + (i % 5)),
                            Estado: ests[i % 5],
                            Aprobado_Por: "8765432" + (i % 10),
                            Total_Controles: "7", Controles_No_Cumple: "0"
                        });
                    } else if (module === "07_IPERC") {
                        const procs = ["Mantenimiento de faja transportadora","Trabajo en altura sobre estructura",
                                       "Manipulación de sustancias químicas","Operación de montacargas","Soldadura en taller"];
                        const niveles = ["Intolerable","Importante","Moderado","Tolerable","Trivial"];
                        const rev = new Date(Date.now() + [-20, 15, 200, 400, 90][i % 5] * 86400000);
                        payload.push({
                            UUID: "IPC-" + (600 + i),
                            Proceso: procs[i % 5],
                            Tipo_IPERC: ["Línea base","Continuo","Específico"][i % 3],
                            Area: ["Mantenimiento","Obra / Campo","Laboratorio","Almacén","Producción"][i % 5],
                            Puesto_Tarea: ["Técnico mecánico","Armador","Analista","Operador","Soldador"][i % 5],
                            Fecha_Elaboracion: new Date(Date.now() - (200 + i * 5) * 86400000).toISOString().slice(0,10),
                            Fecha_Revision: rev.toISOString().slice(0,10),
                            Elaborado_Por: "1000" + i, Revisado_Por: "8765432" + (i % 10),
                            Participantes: "Supervisor de área, operario ejecutante, prevencionista",
                            Estado: ["Aprobado","En revisión","Borrador","Aprobado","Requiere actualización"][i % 5],
                            Riesgo_Maximo: niveles[i % 5],
                            Total_Peligros: String(3 + (i % 8)),
                            Observaciones: "Evaluación participativa con el personal de la tarea."
                        });
                    } else if (module === "06_Capacitaciones") {
                        const temas = ["Trabajo en altura","Espacios confinados","Uso de EPP","Primeros auxilios","Riesgo eléctrico"];
                        const tipos = ["Capacitación específica","Reentrenamiento","Charla de seguridad","Inducción","Certificación externa"];
                        const vig   = ["12","6","12","No vence","24"];
                        // Fechas repartidas para cubrir los tres estados de vigencia:
                        // vencida (-35 d), por vencer (+15 d) y vigente (+700 d)
                        const desfase = [-400, -200, -350, -10, -30][i % 5];
                        const ejec = new Date(Date.now() + desfase * 86400000);
                        const meses = vig[i % 5];
                        let venc = "";
                        if (meses !== "No vence") {
                            const d = new Date(ejec); d.setMonth(d.getMonth() + parseInt(meses));
                            venc = d.toISOString().slice(0,10);
                        }
                        payload.push({
                            UUID: "CAP-" + (700 + i),
                            Nombre_Capacitacion: temas[i % 5] + " — nivel " + (i % 3 === 0 ? "avanzado" : "básico"),
                            Tipo: tipos[i % 5], Tema: temas[i % 5],
                            Modalidad: ["Presencial","Virtual","Mixta","En el puesto"][i % 4],
                            Fecha_Ejecucion: ejec.toISOString().slice(0,10),
                            Duracion_Horas: String(2 + (i % 6)),
                            Vigencia_Meses: meses, Fecha_Vencimiento: venc,
                            Instructor: ["Ana Quispe","Luis Paredes","Carlos Mendoza","María Torres","Consultora SSO"][i % 5],
                            Entidad: (i % 3 === 0 ? "Externa - Instituto SSO" : "Interna"),
                            Lugar: "Sala de capacitación " + (1 + (i % 3)),
                            Estado: "Ejecutada",
                            Evaluacion: (i % 2 === 0 ? "Sí" : "No"), Nota_Minima: "14",
                            Observaciones: "Sesión ejecutada según programa anual.",
                            _totalAsistentes: 5 + (i % 18)
                        });
                    } else if (module === "05_Incidentes") {
                        const tipos = ["Cuasi accidente","Incidente peligroso","Accidente sin tiempo perdido","Accidente con tiempo perdido","Enfermedad ocupacional"];
                        const grav  = ["Leve","Leve","Grave","Leve","Mortal"];
                        const est   = ["Reportado","En investigación","Con acciones abiertas","Cerrado"];
                        const areas = ["Operaciones","Mantenimiento","Almacén","Producción","Obra / Campo"];
                        const nom   = ["Carlos Mendoza","Ana Quispe","Luis Paredes","María Torres","José Huanca"];
                        payload.push({
                            UUID: "INC-" + (900 + i),
                            Fecha_Evento: "2026-0" + (1 + (i % 7)) + "-" + (i < 10 ? "0"+i : i),
                            Hora_Evento: (7 + (i % 10)) + ":30",
                            Tipo_Evento: tipos[i % 5], Gravedad: grav[i % 5],
                            Area: areas[i % 5], Lugar_Exacto: "Sector " + String.fromCharCode(65 + (i % 5)),
                            Nombre_Trabajador: nom[i % 5], Puesto: "Operario",
                            Parte_Afectada: ["No aplica","Manos / dedos","Ojos","Piernas","Cabeza"][i % 5],
                            Dias_Descanso: (i % 5 === 3 ? String(i % 12) : "0"),
                            Descripcion: "Durante la maniobra de " + ["carga","descarga","mantenimiento","traslado","inspección"][i % 5] +
                                         " se produjo un evento que requirió atención inmediata del supervisor de turno.",
                            Causa_Inmediata: ["Falta de EPP","Herramienta defectuosa","Procedimiento no seguido","Superficie resbaladiza","Señalización ausente"][i % 5],
                            Causa_Basica: "Supervisión insuficiente en el turno",
                            Categoria_Causa: ["Factor personal","Equipo / herramienta","Método / procedimiento","Entorno / condiciones","Gestión / supervisión"][i % 5],
                            Estado: est[i % 4], Investigador_DNI: "8765432" + (i % 10),
                            Fecha_Cierre: (i % 4 === 3 ? "2026-07-15" : ""),
                            _accionesAbiertas: (i % 4 === 2 ? (i % 3) + 1 : 0)
                        });
                    } else if (module === "03_Inspecciones") {
                        payload.push({
                            UUID: "INSP-"+i, Fecha_Peru: "2026-04-26", Auditor_DNI: "998877"+i,
                            Area_Inspeccion: (i % 4 === 0 ? "Mina" : "Planta"),
                            Tipo_Hallazgo: (i % 2 === 0 ? "Seguridad" : "Ambiental"),
                            Estado_Actual: (i % 5 === 0 ? "Cerrado" : "Pendiente"),
                            Responsable: ["Carlos Mendoza","Ana Quispe","Luis Paredes","María Torres","José Huanca"][i % 5],
                            Plazo: ["2026-07-15","2026-05-20","2026-06-12"][i % 3]
                        });
                    }
                }
            }

            // Plantillas Google Docs: simula la pestaña _PLANTILLA_PDF del módulo
            window.__MOCK_TEMPLATES = window.__MOCK_TEMPLATES || {};
            if (action === "SAVE_TEMPLATE") {
                window.__MOCK_TEMPLATES[module] = { DOC_ID: req.docId || '', Autor: req.autor || '' };
                setTimeout(() => successCb(JSON.stringify({ status:'OK', msg:'Vinculada (mock).' })), 200);
                return;
            }
            if (action === "READ_TEMPLATE") {
                setTimeout(() => successCb(JSON.stringify({
                    status:'OK', payload: window.__MOCK_TEMPLATES[module] || null })), 200);
                return;
            }
            if (action === "CREATE_DOC_TEMPLATE") {
                const fakeId = 'MOCKDOC' + Math.random().toString(36).slice(2,14).toUpperCase();
                setTimeout(() => successCb(JSON.stringify({
                    status:'OK', docId: fakeId,
                    docUrl: 'https://docs.google.com/document/d/' + fakeId + '/edit',
                    msg: 'Plantilla creada (mock) con ' + (req.campos||[]).length + ' campos, ' +
                         (req.camposHijos||[]).length + ' de detalle y ' + (req.camposFirma||[]).length + ' firma(s).'
                })), 400);
                return;
            }
            if (action === "GENERATE_PDF") {
                setTimeout(() => successCb(JSON.stringify({
                    status:'OK', pdfUrl: 'https://drive.google.com/file/d/MOCKPDF/view',
                    msg: 'PDF generado (mock) para ' + req.uuid })), 400);
                return;
            }

            if (action === "SYNC_OFFLINE_QUEUE") {
                const items = req.items || [];
                setTimeout(() => successCb(JSON.stringify({
                    status: 'OK', okIds: items.map(it => it.id), fallos: [],
                    msg: 'Sync simulado (mock): ' + items.length + ' registros'
                })), 300);
                return;
            }
            if (action === "PING") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', backend: 'appscript', version: 'mock', esquema: 'mock',
                    configurado: true, modulos: null, msg: 'Backend simulado (vista previa local)' })), 150);
                return;
            }
            if (action === "VERIFICAR_PROYECTO") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', checks: [
                    { grupo: 'backend', nombre: 'Backend simulado', estado: 'warn', detalle: 'vista previa local: no hay Sheets ni Drive reales' }
                ] })), 200);
                return;
            }
            if (action === "READ_CHILDREN" || action === "GET_FILES") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', payload: [], archivos: {} })), 150);
                return;
            }
            if (action === "CREATE_USER" || action === "CHANGE_PASSWORD" || action === "LOGOUT" || action === "DELETE_ROWS") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', uuid: (req.datos && req.datos.UUID) || req.uuid || '', msg: 'Simulado (mock)' })), 250);
                return;
            }
            if (action === "READ_DELTA") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', payload: [] })), 300);
                return;
            }
            if (action === "GET_CONFIG" || action === "SAVE_CONFIG") {
                setTimeout(() => successCb(JSON.stringify({ status: 'OK', payload: {}, config: req.config || {}, msg: 'Config mock' })), 200);
                return;
            }

            setTimeout(() => {
                successCb(JSON.stringify({status: "OK", payload: payload, msg: "Mock Success"}));
            }, 500);
          }
        };
        return chain;
      },
      withFailureHandler: function(_failCb) {
          return this.withSuccessHandler(() => {});
      }
    }
  }
};
// El init lo maneja App_Routing.js → initApp() via DOMContentLoaded
</script>
`;

// 1. Generar LOCAL_PREVIEW.html (Con Mocks para PC)
let localContent = indexContent.replace('<?= scriptUrl ?>', '#');

  // Generar 30 registros mock por módulo
  const mockCount = 30;

  // ── MOCK: 01_Usuarios ──────────────────────────────────────────────────
  const usr_avatarGrads = [
    'from-indigo-500 to-violet-500','from-rose-500 to-pink-500',
    'from-emerald-500 to-teal-500','from-amber-500 to-orange-500','from-blue-500 to-cyan-500'
  ];
  let localUsuarios = "";
  for(let i=1; i<=mockCount; i++) {
    const rol  = i % 3 === 0 ? 'Admin' : i % 5 === 0 ? 'Supervisor' : 'Trabajador';
    const grad = usr_avatarGrads[i % 5];
    const initial = String.fromCharCode(64 + (i % 26 || 26));
    const rolCls  = rol === 'Admin'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : rol === 'Supervisor'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-50 text-slate-600 border-slate-200';
    const rolIcon = rol === 'Admin' ? 'shield' : rol === 'Supervisor' ? 'manage_accounts' : 'person';
    localUsuarios += `
      <tr class="hover:bg-blue-50/40 transition-all cursor-pointer group" onclick="changeInternalView('01_Usuarios', 'Detail', 'USR-${i}')">
        <td class="px-3 py-2.5">
          <p class="text-[12px] font-black text-on-surface tabular-nums">${70000000 + i}</p>
          <span class="inline-flex items-center gap-1 mt-0.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            <span class="text-[9px] text-emerald-700 font-bold uppercase tracking-widest">Activo</span>
          </span>
        </td>
        <td class="px-3 py-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[13px] font-black shadow-sm shrink-0">${initial}${i}</div>
            <div>
              <p class="text-[12px] font-bold text-on-surface leading-snug">Usuario Demo ${i}</p>
              <p class="text-[10px] text-secondary">demo${i}@empresa.com</p>
            </div>
          </div>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${rolCls}">
            <span class="material-symbols-outlined text-[11px]" style="font-variation-settings:'FILL' 1">${rolIcon}</span>${rol}
          </span>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span class="material-symbols-outlined text-[11px]" style="font-variation-settings:'FILL' 1">check_circle</span>Activo
          </span>
        </td>
        <td class="px-3 py-2.5 text-center">
          <button onclick="event.stopPropagation(); changeInternalView('01_Usuarios','Edicion','USR-${i}')"
            class="w-8 h-8 rounded-full hover:bg-primary/10 text-secondary hover:text-primary transition-all flex items-center justify-center mx-auto opacity-0 group-hover:opacity-100">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
        </td>
      </tr>`;
  }

  // ── MOCK: 02_Reportes ──────────────────────────────────────────────────
  const rep_cats = ['Preventivo','Correctivo','Condición Crítica','Incidente','Auditoría'];
  const rep_sevs = ['Bajo (Verde)','Medio (Amarillo)','Alto (Rojo)','Crítico (Negro)'];
  const rep_sevConf = {
    'Bajo (Verde)':     { cls:'bg-emerald-50 text-emerald-700 border-emerald-200', dot:'bg-emerald-500' },
    'Medio (Amarillo)': { cls:'bg-amber-50 text-amber-700 border-amber-200',       dot:'bg-amber-400' },
    'Alto (Rojo)':      { cls:'bg-red-50 text-red-700 border-red-200',             dot:'bg-red-500' },
    'Crítico (Negro)':  { cls:'bg-gray-900 text-white border-gray-700',            dot:'bg-white' }
  };
  let localReportes = "";
  for(let i=1; i<=mockCount; i++) {
    const sev  = rep_sevs[i % 4];
    const sc   = rep_sevConf[sev];
    const cat  = rep_cats[i % 5];
    const sync = i % 7 === 0
      ? '<span class="material-symbols-outlined text-[14px] text-amber-500">sync</span><span class="text-[10px] font-bold text-amber-700">Pendiente</span>'
      : '<span class="material-symbols-outlined text-[14px] text-emerald-500" style="font-variation-settings:\'FILL\' 1">cloud_done</span><span class="text-[10px] font-bold text-emerald-700">En Drive</span>';
    localReportes += `
      <tr class="hover:bg-orange-50/30 transition-all cursor-pointer group" onclick="changeInternalView('02_Reportes', 'Detail', 'REP-${500+i}')">
        <td class="px-3 py-2.5">
          <p class="text-[12px] font-bold text-on-surface">${i} Abr 2026</p>
          <p class="text-[10px] font-mono text-secondary">#REP-${500+i}</p>
        </td>
        <td class="px-3 py-2.5">
          <p class="text-[11px] font-semibold text-on-surface">${cat}</p>
          <p class="text-[10px] text-secondary">Insp. #77665${i}</p>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}">
            <span class="w-1.5 h-1.5 rounded-full ${sc.dot} shrink-0"></span>${sev}
          </span>
        </td>
        <td class="px-3 py-2.5">
          <div class="flex items-center gap-1.5">${sync}</div>
        </td>
        <td class="px-3 py-2.5 text-center">
          <button onclick="event.stopPropagation(); changeInternalView('02_Reportes','Detail','REP-${500+i}')"
            class="w-8 h-8 rounded-full hover:bg-primary/10 text-secondary hover:text-primary transition-all flex items-center justify-center mx-auto opacity-0 group-hover:opacity-100">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </td>
      </tr>`;
  }

  // ── MOCK: 03_Inspecciones ──────────────────────────────────────────────
  const insp_areas   = ['Mina','Planta','Talleres','Logística'];
  const insp_tipos   = ['Seguridad','Mantenimiento','Ambiental'];
  const insp_estados = ['Pendiente','En Proceso','Cerrado'];
  const insp_areaConf = {
    'Mina':      'bg-orange-50 text-orange-700 border-orange-200',
    'Planta':    'bg-blue-50 text-blue-700 border-blue-200',
    'Talleres':  'bg-purple-50 text-purple-700 border-purple-200',
    'Logística': 'bg-teal-50 text-teal-700 border-teal-200'
  };
  const insp_estConf = {
    'Pendiente':  { cls:'bg-amber-50 text-amber-700 border-amber-200',   icon:'schedule' },
    'En Proceso': { cls:'bg-blue-50 text-blue-700 border-blue-200',      icon:'autorenew' },
    'Cerrado':    { cls:'bg-emerald-50 text-emerald-700 border-emerald-200', icon:'check_circle' }
  };
  const insp_respNames  = ['Carlos Mendoza','Ana Quispe','Luis Paredes','María Torres','José Huanca'];
  const insp_plazoDates = ['2026-07-15','2026-05-20','2026-06-12'];
  const insp_plazoCls   = [
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-red-50 text-red-700 border-red-200',
    'bg-amber-50 text-amber-700 border-amber-200'
  ];
  const insp_plazoIcon  = ['event_available','warning','schedule'];
  let localInspecciones = "";
  for(let i=1; i<=mockCount; i++) {
    const estado     = insp_estados[i % 3];
    const area       = insp_areas[i % 4];
    const tipo       = insp_tipos[i % 3];
    const ec         = insp_estConf[estado];
    const ac         = insp_areaConf[area];
    const resp       = insp_respNames[i % 5];
    const plazo_d    = insp_plazoDates[i % 3];
    const plazo_cls  = insp_plazoCls[i % 3];
    const plazo_icon = insp_plazoIcon[i % 3];
    localInspecciones += `
      <tr class="hover:bg-indigo-50/30 transition-all cursor-pointer group" onclick="changeInternalView('03_Inspecciones', 'Detail', 'INS-${800+i}')">
        <td class="px-3 py-2.5">
          <p class="text-[10px] font-black text-primary font-mono">#INS-${800+i}</p>
          <p class="text-[10px] text-secondary mt-0.5">2026-04-${i < 10 ? '0'+i : i}</p>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${ac}">${area}</span>
        </td>
        <td class="px-3 py-2.5">
          <p class="text-[11px] font-semibold text-on-surface">Hallazgo de ${tipo} nivel ${i}</p>
          <p class="text-[10px] text-secondary">Auditor #99887${i}</p>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ec.cls}">
            <span class="material-symbols-outlined text-[11px]" style="font-variation-settings:'FILL' 1">${ec.icon}</span>${estado}
          </span>
        </td>
        <td class="px-3 py-2.5">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[13px] text-secondary">person</span>
            <span class="text-[11px] font-semibold text-on-surface">${resp}</span>
          </div>
        </td>
        <td class="px-3 py-2.5">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${plazo_cls}">
            <span class="material-symbols-outlined text-[11px]" style="font-variation-settings:'FILL' 1">${plazo_icon}</span>${plazo_d}
          </span>
        </td>
        <td class="px-3 py-2.5 text-center">
          <button onclick="event.stopPropagation(); changeInternalView('03_Inspecciones','Detail','INS-${800+i}')"
            class="w-8 h-8 rounded-full hover:bg-primary/10 text-secondary hover:text-primary transition-all flex items-center justify-center mx-auto opacity-0 group-hover:opacity-100">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </td>
      </tr>`;
  }

  localContent = localContent.replace(/<!--\s*Filas Mock Inyectadas\s*-->/g, localUsuarios);
  localContent = localContent.replace(/<!--\s*Filas Reportes Mock\s*-->/g, localReportes);
  localContent = localContent.replace(/<!--\s*Filas Inspecciones Mock\s*-->/g, localInspecciones);

localContent = localContent.replace('</head>', `${mockScript}</head>`);
// El preview local usa el mock de google.script.run (proveedor Apps Script),
// no Supabase: sin esto el proveedor por defecto ignoraría el mock.
localContent = localContent.replace(/DB_PROVIDER:\s*'supabase'/, "DB_PROVIDER: 'appscript'");
fs.writeFileSync(path.join(rootDir, 'LOCAL_PREVIEW.html'), localContent);

// 2. Generar PROD_INDEX.html (Listo para Apps Script)
// Aquí mantenemos <?= scriptUrl ?> intacto para que Google lo procese
fs.writeFileSync(path.join(rootDir, 'PROD_INDEX.html'), indexContent);

console.log('✅ Generación completa:');
console.log('   - LOCAL_PREVIEW.html (Para probar en tu PC)');
console.log('   - PROD_INDEX.html (Copia esto al Index.html de Apps Script)');
