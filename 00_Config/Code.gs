/**
 * =========================================================================
 * CORE BACKEND - ZERO TOUCH ROUTER
 * =========================================================================
 * ARCHIVO: Code.gs
 * DESCRIPCIÓN: Controlador monolítico. Este script actúa como enrutador universal.
 * Nunca más tendrás que tocar ni un condicional aquí cuando agregues módulos nuevos.
 * Todo se maneja a través del Payload Frontend y su autodescubrimiento.
 */

// ⚠️=======================================================================
// ⚠️ ZONA DE CONFIGURACIÓN ÚNICA (MODIFICAR SEGÚN EL PROYECTO) ⚠️
// =========================================================================
const CONFIG = {
  // 1. [OBLIGATORIO MODIFICAR]: 
  // Pega aquí el ID alfanumérico de tu Carpeta Raíz Principal en Google Drive.
  ROOT_APP_FOLDER_ID: "SUSTITUIR_POR_TU_ID_DE_DRIVE",
  
  // 2. [ACTUALIZABLE OTA]: 
  // Cambia esto a "1.0.1", "1.1.0" etc, cada vez que edites los HTMLs frontends. 
  // Esto forzará a todos los teléfonos móviles a refrescar su Service Worker (Caché).
  APP_VERSION: "1.0.0",

  // 3. [MODIFICABLE OPCIONAL]: 
  // ID de la carpeta estricta de usuarios si no estuviera mapeada como Modulo 01. 
  // (Por defecto se auto-buscará como si fuera un módulo llamado "01_Usuarios").
  MODULE_USERS_NAME: "01_Usuarios",

  // 4. [ESTÁNDAR CRONOLÓGICO]:
  // Todo registro debe ser GMT-5 (Perú). Asegúrate que en appsscript.json
  // figure: "timeZone": "America/Lima"
  TIMEZONE: "GMT-5"
};

// =========================================================================
// 1. INICIALIZADOR PWA (Renderizado SPA Base)
// =========================================================================
/**
 * Intercepta la URL pública ejecutada en web y despliega el Index principal.
 */
function doGet(e) {
  let html = HtmlService.createTemplateFromFile('Index');
  
  // Skill "Zero-Touch" Automática: El servidor detecta su propia URL y se la pasa al cliente.
  // Esto evita que el usuario tenga que pegar la URL manualmente (Referencia Circular).
  html.scriptUrl = ScriptApp.getService().getUrl();
  
  return html.evaluate()
             .setTitle('Enterprise PWA - Motor ZT')
             .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0')
             .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper Func: Para permitir la fragmentación modular del Frontend (Includes CSS/JS).
 * En tus archivos html usarás: <?!= include('Config.js'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// =========================================================================
// 2. ENRUTADOR CENTRAL "SERVER ROUTER" (Receptor Universal)
// Todos los pedidos Frontend `google.script.run.serverRouter(JSON)` llegan aquí.
// =========================================================================
function serverRouter(requestString) {
  let req;
  try {
    req = JSON.parse(requestString); 
  } catch(e) {
    return JSON.stringify({status: "ERROR", msg: "Payload corrupto. No es un JSON válido."});
  }

  // --- Validación de estructura del payload ---
  const requiredFields = (req.action === 'LOGIN_AUTH') ? ['action', 'userDNI', 'userPassHash'] : ['action', 'moduleName'];
  for (const field of requiredFields) {
    if (req[field] === undefined || req[field] === null || String(req[field]).trim() === '') {
      return JSON.stringify({ status: "ERROR", msg: `Campo requerido ausente en el payload: '${field}'.` });
    }
  }
  const ALLOWED_ACTIONS = ['READ_DB', 'SYNC_OFFLINE_QUEUE', 'DELETE_ROWS', 'SYSTEM_HEALTH_CHECK', 'READ_DELTA', 'LOGIN_AUTH'];
  if (!ALLOWED_ACTIONS.includes(req.action)) {
    return JSON.stringify({ status: "ERROR", msg: `Acción no reconocida: '${req.action}'.` });
  }

  // Protección Anti-Colisiones Críticas mediante LockService
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    // --- 2.1. OTAs & Cache Busting (Evita versiones viejas en celulares) ---
    if(req.appVersion && req.appVersion !== CONFIG.APP_VERSION) {
      return JSON.stringify({status: "RELOAD_CACHE", msg: "Versión PWA descontinuada. Recargando Caché."});
    }

    // --- 2.2. Validación Seguridad y Cese (Auth Validation) ---
    // (Omitido al primer loggeo, exigido para toda otra ruta)
    if(req.action !== "LOGIN_AUTH") {
      const authValidation = authSessionGuard(req.userToken);
      if(authValidation.status === "CESADO") {
        return JSON.stringify({status: "FORCE_LOGOUT", msg: "Credencial revocada corporativamente."});
      }
      if(authValidation.status === "INVALID") {
         // Si el token es inválido o no existe, forzamos re-login
         return JSON.stringify({status: "INVALID_TOKEN", msg: "Sesión expirada o corrompida."});
      }
    }

    // --- 2.3. Enrutamiento Dinámico CRUD hacia Base de Datos Zero-Touch ---
    const responseData = processModuleAction(req);
    
    // Retorno altamente comprimido (String) para evasión de letargos en Red
    return JSON.stringify(responseData); 

  } catch (e) {
    // Intercepción de fallas nativas o de timeout concurrentes
    return JSON.stringify({status: "ERROR", msg: "Timeout de Sistema: " + e.toString()});
  } finally {
    // Si la función finaliza (Error o OK), SOLTAMOS el candado para que el sigt. trabajador pueda guardar.
    lock.releaseLock();
  }
}


// =========================================================================
// 3. MOTOR DE AUTO-DESCUBRIMIENTO DRIVE (Caché Iterators)
// =========================================================================
/**
 * Busca por nombre exacto una carpeta en la raíz (ej. "02_Inspecciones").
 * Implementa Caché Nativo de Servidor (6 Horas) para no demorar la petición a DriveApp.
 */
function getModuleResources(moduleName) {
  const cache = CacheService.getScriptCache();
  const cachedFolderId = cache.get("mod_folder_" + moduleName);
  
  let moduleFolder;

  // Si no está en RAM cacheada, forzamos búsqueda nativa de Drive:
  if (!cachedFolderId) {
    const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_APP_FOLDER_ID);
    const folders = rootFolder.getFoldersByName(moduleName);
    
    if (!folders.hasNext()) {
      throw new Error(`[ZeroTouch-Err]: Carpeta módulo '${moduleName}' no hallada en Directorio Raíz.`);
    }
    moduleFolder = folders.next();
    // Guardamos la ruta encontrada en RAM virtual temporal por 6 horas (21600 Segundos)
    cache.put("mod_folder_" + moduleName, moduleFolder.getId(), 21600); 
  } else {
    moduleFolder = DriveApp.getFolderById(cachedFolderId);
  }

  // Ubicamos la Hoja de Calculo Google Sheets de la Carpeta (Base de Dato DB)
  // NOTA DEV: Requiere que haya un solo Sheets en la Raiz de dicha carpeta de módulo.
  const cachedSheetFileId = cache.get("mod_dbSheet_" + moduleName);
  let dbSheetId;
  
  if(!cachedSheetFileId){
     const sheetsIterator = moduleFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
     if (!sheetsIterator.hasNext()) {
         throw new Error(`[ZeroTouch-Err]: Carpeta '${moduleName}' no posee un Sheets de Base de Datos Base.`);
     }
     dbSheetId = sheetsIterator.next().getId();
     cache.put("mod_dbSheet_" + moduleName, dbSheetId, 21600);
  } else {
     dbSheetId = cachedSheetFileId;
  }

  // Extracción del Subconfig (Contenedor Sheets con Propiedades y Permisos Variables)
  const subconfigFolderIterator = moduleFolder.getFoldersByName("subconfig");
  let subconfigData = null; // Tu IA desarrollará cómo parsear ese subconfig más tarde

  return {
    moduleFolder: moduleFolder,
    dbSpreadsheet: SpreadsheetApp.openById(dbSheetId),
    subconfigFolder: subconfigFolderIterator.hasNext() ? subconfigFolderIterator.next() : null
  };
}


// =========================================================================
// 4. CONTROLADOR CRUD & G-TRASH (Carga de Tablas y Basura)
// =========================================================================
function processModuleAction(req) {
  // Extraemos dinámicamente recursos del Backend sin tener variables rígidas
  const res = getModuleResources(req.moduleName);
  const sheet = res.dbSpreadsheet.getSheets()[0]; // Leemos la Pestaña 1 por defecto

  switch (req.action) {
      
    // 4.1. LECTURA (Paginada — FIX-19)
    case 'READ_DB':
      try {
        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        if (lastRow < 2 || lastCol < 1) return { status: "OK", payload: [], totalRows: 0, page: 0, hasMore: false };

        const PAGE_SIZE = req.pageSize || 200;
        const page = req.page || 0;

        // Fila 1 = cabeceras; datos comienzan en fila 2
        const startDataRow = 2 + (page * PAGE_SIZE);
        if (startDataRow > lastRow) {
          return { status: "OK", payload: [], totalRows: lastRow - 1, page: page, hasMore: false };
        }

        const rowsToFetch = Math.min(PAGE_SIZE, lastRow - startDataRow + 1);
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const dataRange = sheet.getRange(startDataRow, 1, rowsToFetch, lastCol).getValues();

        const parsedData = dataRange.map(row => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i]; });
          return obj;
        });

        const totalRows = lastRow - 1;
        const hasMore = (startDataRow + rowsToFetch - 1) < lastRow;

        return { status: "OK", payload: parsedData, totalRows: totalRows, page: page, hasMore: hasMore };
      } catch(e) {
        throw new Error("Fallo al leer datos origen " + req.moduleName + ": " + e);
      }

    // 4.2. INSERCIÓN MÚLTIPLE (BULK/BATCES QUEUE PUSH)
    case 'SYNC_OFFLINE_QUEUE': {
      const parentItems = req.dataArray;
      const childItems  = req.childDataArray || [];
      const subconfig   = req.subconfig || null;

      if (!parentItems || parentItems.length === 0) {
        return { status: "OK", msg: "Cola vacía, nada que sincronizar." };
      }

      // -- AUTO-CREACIÓN DE PESTAÑAS (ZERO-TOUCH) --
      const ensureSheet = (pName, schema) => {
        let s = res.dbSpreadsheet.getSheetByName(pName);
        if (!s) {
          s = res.dbSpreadsheet.insertSheet(pName);
          const headers = schema.map(f => f.name || f);
          s.appendRow(headers);
        }
        return s;
      };

      // Si no hay subconfig, usamos la hoja principal y las keys del primer item
      const parentTableName = (subconfig && subconfig.Config_Modular)
        ? subconfig.Config_Modular.PARENT_TABLE
        : res.dbSpreadsheet.getSheets()[0].getName();

      const pSheet = ensureSheet(parentTableName, Object.keys(parentItems[0]).filter(k => k !== '_action'));

      // -- PROCESAMIENTO MULTIMEDIA (SKILL 11) --
      const processedParents  = subconfig
        ? parentItems.map(item => processFilesForItem(item, subconfig, res.moduleFolder))
        : parentItems;
      const processedChildren = (subconfig && childItems.length > 0)
        ? childItems.map(item => processFilesForItem(item, subconfig, res.moduleFolder))
        : childItems;

      syncToSheet(pSheet, processedParents);

      if (subconfig && subconfig.Config_Modular && subconfig.Config_Modular.CHILD_TABLE && processedChildren.length > 0) {
        const cSheet = ensureSheet(subconfig.Config_Modular.CHILD_TABLE, Object.keys(processedChildren[0]).filter(k => k !== '_action'));
        syncToSheet(cSheet, processedChildren);
      }

      // -- AUTOMATIZACIÓN: ENVÍO DE CORREO (SKILL 10) --
      if (subconfig && subconfig.Config_Modular && subconfig.Config_Modular.EMAIL_TEMPLATE_ID) {
        try {
          sendTemplatedEmail(subconfig.Config_Modular.EMAIL_TEMPLATE_ID, parentItems[0], childItems, subconfig);
        } catch(err) {
          Logger.log("Error en Skill 10 (Email): " + err.message);
        }
      }

      return { status: "OK", msg: "Sincronización Atómica Exitosa. Items: " + parentItems.length };
    }

    // 4.3. ELIMINADOR G-TRASH (Eliminación en Cascada)
    case 'DELETE_ROWS':
      const pTable = req.subconfig.Config_Modular.PARENT_TABLE;
      const cTable = req.subconfig.Config_Modular.CHILD_TABLE;
      const rKey = req.subconfig.Config_Modular.RELATIONAL_KEY || "UUID";
      const idsToDelete = req.dataIdsToBeDeleted;

      const deleteFromSheet = (tableName, keyName, ids) => {
        const s = res.dbSpreadsheet.getSheetByName(tableName);
        if (!s) return { deleted: 0, error: `Hoja '${tableName}' no encontrada` };
        const data = s.getDataRange().getValues();
        if (data.length < 2) return { deleted: 0, error: null };
        const keyIdx = data[0].indexOf(keyName);
        if (keyIdx === -1) return { deleted: 0, error: `Columna clave '${keyName}' no encontrada en '${tableName}'` };

        let count = 0;
        for (let i = data.length - 1; i >= 1; i--) {
          if (ids.includes(String(data[i][keyIdx]))) {
            s.deleteRow(i + 1);
            count++;
          }
        }
        return { deleted: count, error: null };
      };

      // Primero eliminamos hijos (si hay tabla hija)
      let childrenResult = { deleted: 0, error: null };
      if (cTable) {
        childrenResult = deleteFromSheet(cTable, rKey, idsToDelete);
      }

      // Luego eliminamos padres
      const parentsResult = deleteFromSheet(pTable, "UUID", idsToDelete);

      const _delErrors = [parentsResult.error, childrenResult.error].filter(Boolean);
      return {
        status: _delErrors.length > 0 ? "PARTIAL" : "OK",
        msg: `Limpieza terminada. Padres: ${parentsResult.deleted}, Hijos: ${childrenResult.deleted}`,
        itemsDeleted: parentsResult.deleted,
        error: _delErrors.length > 0 ? _delErrors.join('; ') : null
      };

    // 4.4. SALUD SISTÉMICA (VALIDACIÓN DE PARIDAD) - MANDATORIO GUÍA MAESTRA
    case 'SYSTEM_HEALTH_CHECK':
      try {
        const rawData = sheet.getDataRange().getValues();
        const sheetHeaders = rawData[0];
        const subconfigFileName = `${req.moduleName}/subconfig_${req.moduleName}.js`;
        let subconfigContent = "";
        try {
           subconfigContent = HtmlService.createHtmlOutputFromFile(subconfigFileName).getContent();
        } catch(e) {
           return { status: "WARNING", msg: "Archivo subconfig no accesible." };
        }

        const regexKeys = /"([^"]+)":\s*{/g;
        let expectedKeys = [];
        let match;
        while ((match = regexKeys.exec(subconfigContent)) !== null) {
          if (!["Config_Modular", "Variables"].includes(match[1])) expectedKeys.push(match[1]);
        }

        const missingInSheet = expectedKeys.filter(k => !sheetHeaders.includes(k));
        const orphanInSheet = sheetHeaders.filter(h => h !== "" && !expectedKeys.includes(h));

        return { 
          status: missingInSheet.length > 0 ? "ERROR" : "OK",
          missingColumns: missingInSheet,
          orphans: orphanInSheet,
          msg: missingInSheet.length > 0 ? "Inconsistencia detectada." : "Estructura íntegra."
        };
      } catch(e) {
        return { status: "ERROR", msg: e.toString() };
      }

    // 4.5. LECTURA INCREMENTAL (DELTA SYNC) - SKILL 7.D
    case 'READ_DELTA':
      try {
        const rawData = sheet.getDataRange().getValues();
        if(rawData.length < 2) return { status: "OK", payload: [] };

        const headers = rawData[0];
        const dataRows = rawData.slice(1);
        const lastSync = new Date(req.lastSyncDate || '2000-01-01').getTime();

        // Prioridad de columna de tiempo: campo explícito en req > campos conocidos > columna 0
        const TS_CANDIDATES = [
          req.tsField,
          'Fecha_Registro', 'Fecha_Peru', 'Fecha_Emision',
          'Ultima_Actualizacion', 'Timestamp', 'created_at'
        ].filter(Boolean);

        let dateColIdx = -1;
        for (const candidate of TS_CANDIDATES) {
          const idx = headers.indexOf(candidate);
          if (idx !== -1) { dateColIdx = idx; break; }
        }

        if (dateColIdx === -1) return { status: "OK", payload: [] };

        const deltaData = dataRows
          .filter(row => {
            const val = row[dateColIdx];
            if (!val) return false;
            const ts = new Date(val).getTime();
            return !isNaN(ts) && ts > lastSync;
          })
          .map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });

        return { status: "OK", payload: deltaData, msg: deltaData.length + ' registros delta' };
      } catch(e) {
        return { status: "ERROR", msg: e.toString() };
      }

    // 4.6. AUTENTICACIÓN (LOGIN)
    case 'LOGIN_AUTH':
      try {
        const uLoginRes = getModuleResources(CONFIG.MODULE_USERS_NAME);
        const uLoginSheet = uLoginRes.dbSpreadsheet.getSheets()[0];
        const uLoginData = uLoginSheet.getDataRange().getValues();
        if (uLoginData.length < 2) return { status: "ERROR", msg: "Sin usuarios registrados." };

        const uHeaders = uLoginData[0];
        const dniCol = uHeaders.indexOf("DNI");
        const passCol = uHeaders.indexOf("Password_Hash");
        const statusCol = uHeaders.indexOf("Status");
        const nameCol = uHeaders.indexOf("Nombre_Completo");
        const rolCol = uHeaders.indexOf("Rol");

        const userRow = uLoginData.slice(1).find(row => String(row[dniCol]) === String(req.userDNI));
        if (!userRow) return { status: "ERROR", msg: "Usuario no encontrado." };
        if (String(userRow[statusCol]).toUpperCase() === "CESADO") return { status: "CESADO", msg: "Acceso revocado corporativamente." };
        if (String(userRow[passCol]) !== String(req.userPassHash)) return { status: "ERROR", msg: "Contraseña incorrecta." };

        const userData = {};
        uHeaders.forEach((h, i) => { if (h !== 'Password_Hash') userData[h] = userRow[i]; });
        return { status: "OK", userData: userData };
      } catch(e) {
        return { status: "ERROR", msg: "Error en autenticación: " + e.toString() };
      }

    // 4.7. SALIDA DEFAULT
    default:
      return { status: "ERROR", msg: "Instrucción de Negocio (Action) no encontrada." };
  }
}

// =========================================================================
// 5. AUTENTICACIÓN
// =========================================================================
/**
 * ⚠️ CONFIGURABLE / MODIFICABLE: Si tu tabla Usuarios tiene otro formato, edita esta porción temporal.
 * Valida de forma ininterrumpida que el Token de Sesion pertenezca a un empleado "Activo".
 */
function authSessionGuard(tokenFrontEnd) {
   if(!tokenFrontEnd) return { status: "INVALID" };

   // CacheService: evita leer el Sheets en cada request (TTL: 5 minutos)
   const cache = CacheService.getScriptCache();
   const cacheKey = "auth_" + tokenFrontEnd;
   const cached = cache.get(cacheKey);
   if (cached) return JSON.parse(cached);

   let uRes;
   try { uRes = getModuleResources(CONFIG.MODULE_USERS_NAME); } catch(e) {
     return { status: "OK" }; // Sin módulo de usuarios en fase dev, no bloqueamos.
   }

   const uSheet = uRes.dbSpreadsheet.getSheets()[0];
   const data = uSheet.getDataRange().getValues();
   if(data.length < 2) return { status: "INVALID" };

   const headers = data[0];
   const tokenCol  = headers.indexOf("DNI");
   // Búsqueda insensible a mayúsculas: soporta "Status", "STATUS", "status"
   const statusCol = headers.findIndex(h => String(h).trim().toUpperCase() === "STATUS");

   if(tokenCol === -1 || statusCol === -1) return { status: "OK" }; // Skip en fase dev

   const usuarioDetectado = data.slice(1).find(row => String(row[tokenCol]) === String(tokenFrontEnd));

   let result;
   if (!usuarioDetectado) {
     result = { status: "INVALID" };
   } else {
     const userStatus = String(usuarioDetectado[statusCol]).trim().toUpperCase();
     result = (userStatus === "CESADO" || userStatus === "INACTIVO")
       ? { status: "CESADO" }
       : { status: "VALID" };
   }

   // Cachear resultado 5 minutos para reducir lecturas al Sheets
   cache.put(cacheKey, JSON.stringify(result), 300);
   return result;
}

/**
 * Helper para inyectar datos en una hoja respetando cabeceras.
 * Filtra UUIDs ya existentes para evitar duplicados en re-sincronizaciones parciales.
 */
function syncToSheet(sheet, dataArray) {
  if (dataArray.length === 0) return;

  const allData  = sheet.getDataRange().getValues();
  const headers  = allData[0];
  const uuidIdx  = headers.indexOf("UUID");

  // Construir Set de UUIDs ya persistidos en O(n) para lookup O(1)
  const existingUUIDs = new Set();
  if (uuidIdx !== -1) {
    for (let i = 1; i < allData.length; i++) {
      const v = allData[i][uuidIdx];
      if (v) existingUUIDs.add(String(v));
    }
  }

  const appendMatrix = dataArray
    .filter(item => !item.UUID || !existingUUIDs.has(String(item.UUID)))
    .map(item => {
      if (!item.UUID) item.UUID = Utilities.getUuid();
      return headers.map(h => (item[h] !== undefined) ? item[h] : "");
    });

  if (appendMatrix.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, appendMatrix.length, headers.length).setValues(appendMatrix);
}

/**
 * Skill 10: Envío de Correo basado en Plantilla Google Docs
 */
function sendTemplatedEmail(docId, parentData, childData, subconfig) {
  const doc = DocumentApp.openById(docId);
  const title = doc.getName();
  let bodyContent = doc.getBody().getText();

  // Reemplazo de variables Padre: <<[VAR]>>
  for (let key in parentData) {
    const placeholder = "<<[" + key + "]>>";
    bodyContent = bodyContent.split(placeholder).join(parentData[key]);
  }

  // Si hay tabla hija, creamos un bloque de tabla simple en texto (o HTML si se mejora)
  if (childData.length > 0) {
    let childTableText = "\\n--- DETALLE ---\\n";
    childData.forEach((row, i) => {
      childTableText += `[${i+1}] ` + Object.values(row).join(" | ") + "\\n";
    });
    bodyContent = bodyContent.split("<<[TABLA_HIJA]>>").join(childTableText);
  }

  // Envío (Se asume que el DNI del inspector tiene un correo en la tabla interna o se usa el del payload)
  const recipient = parentData.Email || parentData.Inspector_Email || Session.getActiveUser().getEmail();
  
  MailApp.sendEmail({
    to: recipient,
    subject: `Notificación: ${subconfig.Config_Modular.Titulo} - ${parentData.UUID || ""}`,
    body: bodyContent
  });
}

/**
 * Skill 11: Procesa campos multimedia, sube a Drive y retorna metadatos
 */
function processFilesForItem(item, subconfig, moduleFolder) {
  const newItem = { ...item };
  const variables = subconfig.Variables || {};
  
  for (let key in variables) {
    const fieldDef = variables[key];
    const isMedia = ["Image", "File", "Signature", "Image_Collection"].includes(fieldDef.type);
    
    if (isMedia && newItem[key]) {
      const fieldData = newItem[key];
      const isCollection = Array.isArray(fieldData);
      const dataToProcess = isCollection ? fieldData : [fieldData];
      
      let ids = [];
      let paths = [];
      let urls = [];

      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      dataToProcess.forEach((rawData, index) => {
        if (typeof rawData === "string" && rawData.startsWith("data:")) {
          try {
            const base64Data = rawData.split(",")[1];
            const contentType = rawData.split(";")[0].split(":")[1];
            if (!ALLOWED_MIME_TYPES.includes(contentType)) {
              console.error(`[SECURITY] Tipo MIME rechazado: ${contentType} en campo ${key}`);
              return;
            }
            const extension = contentType.split("/")[1] || "png";
            const fileName = `${key}_${item.UUID || Date.now()}_${index}.${extension}`;
            const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileName);
            
            const file = moduleFolder.createFile(blob);
            ids.push(file.getId());
            paths.push(`${subconfig.Config_Modular.DRIVE_FOLDER_NAME}/${file.getName()}`);
            urls.push(file.getUrl());
          } catch (e) {
            console.error(`Error procesando archivo ${key}[${index}]: `, e.message);
          }
        } else {
           // Si ya es una URL, la mantenemos
           urls.push(rawData);
        }
      });

      if (ids.length > 0) {
        newItem[`${key}_ID`] = ids.join(", ");
        newItem[`${key}_Path`] = paths.join(", ");
        newItem[key] = urls.join(", ");
      }
    }
  }
  return newItem;
}
