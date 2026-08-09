<script>
/**
 * =========================================================================
 * APP ROUTING & MODULE LOADER
 * =========================================================================
 * ARCHIVO: App_Routing.js.html
 * DESCRIPCIÓN: Gestiona la navegación entre módulos y la carga dinámica
 * de configuraciones (Subconfig). Es el cerebro que decide qué se muestra.
 */

// El objeto AppState ya viene definido desde Global_Config.js.html
// Solo aseguramos que las propiedades necesarias para el ruteo existan:
if(!AppState.currentView) AppState.currentView = 'Login';

/**
 * Inicializador Maestro
 */
async function initApp() {
  console.log("🚀 Iniciando Ruteador...");
  
  // 1. Inicializar DB Offline
  await initOfflineDB();
  
  // 2. Verificar Sesión
  if (!AppState.User.Token) {
    showView('Login');
  } else {
    showView('Menu');
  }
}

/**
 * Cambia la vista principal del contenedor
 * @param {string} viewID - Login, Menu o el nombre de un módulo (ej: 01_Reportes)
 */
function showView(viewID) {
  const container = document.getElementById('main-container');
  const appTitle = document.getElementById('app-title');
    // Limpiar clases activas en sidebar si aplica
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    // Skill #15/17: Control de Visibilidad y Limpieza de Interfaz
    const syncBtn = document.getElementById('ui-global-sync-btn');
    const footer = document.getElementById('main-footer');
    
    // Limpieza del SLOT de filtros que ahora está en la vista clonada (usar querySelector sobre el contenedor)
    const activeFilterSlot = container.querySelector('#ui-filter-slot');
    if (activeFilterSlot) activeFilterSlot.innerHTML = '';

    if (viewID !== 'Login' && viewID !== 'Menu') {
        if (syncBtn) syncBtn.style.display = 'flex';
        if (footer) footer.style.display = 'flex';
        const moduleMatch = viewID.match(/(^\d+_[A-Za-z]+)/);
        if (moduleMatch) AppState.currentModule = moduleMatch[0];
    } else {
        if (syncBtn) syncBtn.style.display = 'none';
        if (footer) footer.style.display = (viewID === 'Menu' ? 'flex' : 'none');
        AppState.currentModule = null;
    }

  // Limpiar antes de inyectar
  container.innerHTML = '';
  
  if (viewID === 'Login') {
    appTitle.innerText = "Acceso - PWA";
    container.innerHTML = renderLogin();
  } 
  else if (viewID === 'Menu') {
    appTitle.innerText = "Menú Principal";
    container.innerHTML = renderMenu();
  } 
  else {
    // Carga de Módulos (Ej: 03_Inspecciones)
    AppState.activeModule = viewID;
    appTitle.innerText = viewID.replace(/^\d+_/, '').replace(/_/g, ' ');
    
    // Inyectar TODAS las vistas del módulo (Resumen, Edicion, Detalle)
    const views = ['resumen', 'edicion', 'detalle'];
    let foundAny = false;
    
    views.forEach(v => {
      const viewDOM = document.getElementById(`module-${viewID.toLowerCase()}-${v}`);
      if (viewDOM) {
        container.appendChild(viewDOM.cloneNode(true));
        foundAny = true;
      }
    });

    if (!foundAny) {
      container.innerHTML = `<p style="color:red; text-align:center;">Error: No se encontraron vistas para [${viewID}].</p>`;
    } else {
      // Por defecto mostrar el Resumen al entrar
      changeInternalView(viewID, 'Resumen');
    }
  }
}

/**
 * Controla la navegación interna entre las 3 vistas obligatorias
 * @param {string} moduleID - ID del módulo
 * @param {string} viewType - Resumen, Edicion o Detalle
 * @param {string} recordID - Opcional para carga de datos en Detalle/Edicion
 */
function changeInternalView(moduleID, viewType, recordID = null) {
  try {
    console.log(`🔄 Cambiando vista interna: ${moduleID} -> ${viewType}`);
    const modLower = moduleID.toLowerCase();
    // Normalización de nombres de vistas (Soporte Multi-idioma Detail/Detalle)
    let viewMap = {
      'detail': 'detalle',
      'edit': 'edicion',
      'edition': 'edicion',
      'summary': 'resumen',
      'resumen': 'resumen',
      'detalle': 'detalle',
      'edicion': 'edicion'
    };
    const vtLower = viewType.toLowerCase();
    const vtRef = viewMap[vtLower] || vtLower;

    console.log(`🎯 Buscando elemento con patrón: [${modLower}] + [${vtRef}]`);

    // 1. Ocultar todas las vistas del módulo actual dentro del contenedor
    const allViews = document.querySelectorAll('#main-container .module-view');
    allViews.forEach(el => el.style.display = 'none');

    // 2. Identificar y activar la vista solicitada (Selector flexible para ID)
    const activeEl = document.querySelector(`#main-container [id*="${modLower}"][id*="${vtRef}"]`);
    
    if (!activeEl) {
        console.error(`❌ No se pudo localizar el elemento de vista para modulo: ${modLower} y vista: ${vtRef}`);
        // Fallback: tratar de buscar por ID exacto si el selector flexible falla
        const fallbackId = `module-${modLower}-${vtRef}`;
        const fallbackEl = document.getElementById(fallbackId);
        if(!fallbackEl) {
          console.error("❌ Fallback de ID exacto también falló.");
          return;
        }
        fallbackEl.style.display = 'block';
        return;
    }

    activeEl.style.display = 'block';

    // Skill #17: Gestión de Filtros
    if (vtLower === 'resumen') {
        // Skill #19: Renderizado dinámico de filtros basado en Subconfig
        PWA_SKILLS.renderDynamicFilters(moduleID);
    } 
    else if (vtRef === 'edicion') {
        // Skill 11: Auto-inicialización de Pizarras de Firma
        setTimeout(() => {
          const pads = activeEl.querySelectorAll('canvas[id*="sign"], canvas[id*="signature"]');
          pads.forEach(p => PWA_SKILLS.initSignaturePad(p.id));
          console.log(`✍️ Signature Pads inicializados en ${moduleID}`);
        }, 300);
    }
    }
    
    // Si entramos a DETALLE, disparamos el motor de renderizado de la Regla 12
    if (vtLower === 'detalle' && recordID) {
      const renderFunctionName = `loadDetail_${moduleID}`;
      if (typeof window[renderFunctionName] === "function") {
         window[renderFunctionName](recordID);
      }
    }
  } catch (err) {
    console.error("🔥 Error crítico en ruteo interno:", err);
  }
}

/**
 * Renders temporales (Simulados - Tu IA los hará hermosos en cada Mod_X.html)
 */
/**
 * Renders temporales (Enterprise Login)
 */
function renderLogin() {
  return `
    <div class="max-w-[450px] mx-auto mt-20 animate-in fade-in zoom-in duration-500">
       <div class="bg-white rounded-[2rem] border border-outline-variant p-10 shadow-2xl relative overflow-hidden">
          <!-- Decoración visual -->
          <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl"></div>
          
          <div class="flex flex-col items-center mb-10">
             <div class="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/20 rotate-3">
                <span class="material-symbols-outlined text-white text-3xl">verified_user</span>
             </div>
             <h1 class="text-2xl font-black text-on-surface tracking-tighter">ScriptManager</h1>
             <p class="text-xs text-secondary font-bold uppercase tracking-widest mt-1">Acceso Corporativo</p>
          </div>

          <div class="space-y-6">
             <div>
                <label class="block text-[10px] font-black text-secondary uppercase mb-2 ml-1">Identificación (DNI)</label>
                <div class="relative">
                   <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">person</span>
                   <input type="text" id="login-dni" placeholder="Ej: 772210..." class="w-full h-14 pl-12 pr-4 rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                </div>
             </div>

             <div>
                <label class="block text-[10px] font-black text-secondary uppercase mb-2 ml-1">Contraseña de Seguridad</label>
                <div class="relative">
                   <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">vpn_key</span>
                   <input type="password" id="login-pass" placeholder="••••••••" class="w-full h-14 pl-12 pr-4 rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                </div>
             </div>

             <button onclick="handleLogin()" class="w-full h-14 bg-primary text-on-primary rounded-2xl font-bold shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                Ingresar al Sistema
                <span class="material-symbols-outlined text-xl">chevron_right</span>
             </button>
          </div>

          <div class="mt-10 text-center">
             <p class="text-[10px] text-secondary font-medium italic">Protegido por Cifrado SHA-256 nativo</p>
          </div>
       </div>
    </div>
  `;
}

function renderMenu() {
  return `
<!-- Welcome Header -->
<header class="mb-6">
<h1 class="font-h1 text-h1 text-primary">Panel de Control</h1>
<p class="font-body-md text-body-md text-on-surface-variant mt-1">Hola, Administrador. Gestiona tus flujos de trabajo.</p>
</header>
<!-- Search Bar Section -->
<section class="mb-6">
<div class="relative group">
<div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
<span class="material-symbols-outlined text-outline text-xl" data-icon="search">search</span>
</div>
<input class="block w-full pl-11 pr-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm outline-none font-body-md text-body-md" placeholder="Buscar módulos..." type="text"/>
</div>
</section>
<!-- Module Grid (Two Columns) -->
<section class="bento-grid">
<!-- Inspecciones -->
<div onclick="showView('03_Inspecciones')" class="group relative bg-white border border-outline-variant p-4 rounded-xl hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer">
<div>
<div class="flex justify-between items-start mb-3">
<div class="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container">
<span class="material-symbols-outlined text-xl" data-icon="assignment">assignment</span>
</div>
<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-label-md text-[9px] uppercase tracking-wider font-bold">Activo</span>
</div>
<h3 class="font-h3 text-h3 text-primary mb-0.5 truncate">Inspecciones</h3>
<p class="font-body-md text-[12px] text-secondary line-clamp-1">Gestión de registros</p>
</div>
<div class="mt-4 flex items-center text-primary text-[12px] font-semibold group-hover:translate-x-0.5 transition-transform">
<span>Acceder</span>
<span class="material-symbols-outlined ml-0.5 text-sm" data-icon="chevron_right">chevron_right</span>
</div>
</div>
<!-- Usuarios -->
<div onclick="showView('01_Usuarios')" class="group relative bg-white border border-outline-variant p-4 rounded-xl hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer">
<div>
<div class="flex justify-between items-start mb-3">
<div class="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-container">
<span class="material-symbols-outlined text-xl" data-icon="group">group</span>
</div>
<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-label-md text-[9px] uppercase tracking-wider font-bold">Sync</span>
</div>
<h3 class="font-h3 text-h3 text-primary mb-0.5 truncate">Usuarios</h3>
<p class="font-body-md text-[12px] text-secondary line-clamp-1">Gestión de personal</p>
</div>
<div class="mt-4 flex items-center text-primary text-[12px] font-semibold group-hover:translate-x-0.5 transition-transform">
<span>Gestionar</span>
<span class="material-symbols-outlined ml-0.5 text-sm" data-icon="chevron_right">chevron_right</span>
</div>
</div>
<!-- Reportes -->
<div onclick="showView('02_Reportes')" class="group relative bg-white border border-outline-variant p-4 rounded-xl hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer">
<div>
<div class="flex justify-between items-start mb-3">
<div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
<span class="material-symbols-outlined text-xl" data-icon="list_alt">list_alt</span>
</div>
</div>
<h3 class="font-h3 text-h3 text-primary mb-0.5 truncate">Reportes</h3>
<p class="font-body-md text-[12px] text-secondary line-clamp-1">Monitoreo operativo</p>
</div>
<div class="mt-4 flex items-center text-primary text-[12px] font-semibold group-hover:translate-x-0.5 transition-transform">
<span>Ver reportes</span>
<span class="material-symbols-outlined ml-0.5 text-sm" data-icon="chevron_right">chevron_right</span>
</div>
</div>
<!-- SuperAdmin -->
<div onclick="showView('00_Admin')" class="group relative bg-primary text-on-primary p-4 rounded-xl hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden">
<div class="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-white/5 rounded-full blur-xl"></div>
<div class="relative z-10">
<div class="flex justify-between items-start mb-3">
<div class="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
<span class="material-symbols-outlined text-xl" data-icon="admin_panel_settings">admin_panel_settings</span>
</div>
</div>
<h3 class="font-h3 text-h3 text-white mb-0.5 truncate">SuperAdmin</h3>
<p class="font-body-md text-[12px] text-blue-100 line-clamp-1">Configuración matriz</p>
</div>
<div class="mt-4 flex items-center text-white text-[12px] font-semibold group-hover:translate-x-0.5 transition-transform relative z-10">
<span>Ajustes</span>
<span class="material-symbols-outlined ml-0.5 text-sm" data-icon="arrow_forward">arrow_forward</span>
</div>
</div>
<!-- Logout -->
<div onclick="handleLogout()" class="group relative bg-white border border-outline-variant p-4 rounded-xl hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer">
<div>
<div class="flex justify-between items-start mb-3">
<div class="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-on-error-container">
<span class="material-symbols-outlined text-xl" data-icon="logout">logout</span>
</div>
<div class="w-2 h-2 rounded-full border-error animate-pulse mt-2"></div>
</div>
<h3 class="font-h3 text-h3 text-error mb-0.5 truncate">Sesión</h3>
<p class="font-body-md text-[12px] text-secondary line-clamp-1">Desconectar cuenta</p>
</div>
<div class="mt-4 flex items-center text-error text-[12px] font-semibold group-hover:translate-x-0.5 transition-transform">
<span>Cerrar</span>
<span class="material-symbols-outlined ml-0.5 text-sm" data-icon="chevron_right">chevron_right</span>
</div>
</div>
<!-- Dashboard Stats Compact -->
<div class="group relative bg-surface-container-low border border-outline-variant p-4 rounded-xl flex flex-col justify-between pointer-events-none">
<div class="space-y-3">
<div class="flex items-center justify-between">
<span class="text-[11px] font-medium text-on-surface-variant">Uptime</span>
<span class="text-[11px] font-bold text-primary">99.9%</span>
</div>
<div class="w-full bg-surface-variant rounded-full h-1">
<div class="bg-primary h-1 rounded-full" style="width: 99.9%"></div>
</div>
<div class="flex items-center justify-between pt-1">
<span class="text-[11px] font-medium text-on-surface-variant">Scripts</span>
<span class="text-[11px] font-bold text-primary">1.2k</span>
</div>
<div class="flex gap-0.5 h-6 mt-1">
<div class="flex-1 bg-primary-container/20 rounded-sm self-end h-[40%]"></div>
<div class="flex-1 bg-primary-container/40 rounded-sm self-end h-[60%]"></div>
<div class="flex-1 bg-primary-container/20 rounded-sm self-end h-[30%]"></div>
<div class="flex-1 bg-primary-container/60 rounded-sm self-end h-[90%]"></div>
<div class="flex-1 bg-primary-container/30 rounded-sm self-end h-[50%]"></div>
</div>
</div>
</div>
</section>
<!-- Quick Actions -->
<section class="mt-8 bg-white rounded-2xl border border-outline-variant p-6 shadow-sm">
<div class="flex flex-col gap-4">
<div>
<h2 class="text-lg font-bold text-primary">Sincronización</h2>
<p class="text-[12px] text-secondary mt-0.5">Última hace 4 minutos.</p>
</div>
<div class="grid grid-cols-2 gap-3">
<button onclick="PWA_SKILLS.triggerGlobalSync()" class="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-2 rounded-lg font-button transition-colors flex items-center justify-center gap-1">
<span class="material-symbols-outlined text-sm" data-icon="bolt">bolt</span>
<span class="text-[12px]">Sincronizar</span>
</button>
<button onclick="showView('00_Admin')" class="border border-outline-variant hover:bg-surface-container py-2.5 px-2 rounded-lg font-button text-primary transition-colors flex items-center justify-center gap-1">
<span class="material-symbols-outlined text-sm" data-icon="download">download</span>
<span class="text-[12px]">Logs</span>
</button>
</div>
</div>
</section>
  `;
}

/**
 * Lógica de Login (SHA-256 Integration)
 */
async function handleLogin() {
  const dni = document.getElementById('login-dni').value;
  const pass = document.getElementById('login-pass').value;
  
  if (!dni || !pass) return alert("⚠️ Se requieren credenciales completas.");
  
  // Skill de Seguridad: Hashing SHA-256
  const hash = await PWA_SKILLS.hashSHA256(pass);
  console.log(`🔐 Login Attempt: DNI=${dni} | Hash=${hash}`);

  // Simulación de validación persistente
  AppState.updateSession({ 
     DNI: dni, 
     Token: hash, // El token es el hash de seguridad
     Status: "Activo",
     Role: "Admin" 
  });
  
  showView('Menu');
}

/**
 * Lógica de Logout (Voluntario)
 */
function handleLogout() {
  if (confirm("¿Está seguro de cerrar sesión?")) {
    AppState.clearSession();
  }
}

// Iniciar aplicación al cargar
window.addEventListener('DOMContentLoaded', initApp);

</script>
