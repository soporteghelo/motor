# Guía de Configuración de Google Drive (Motor Zero-Touch)

Para que el Backend monolítico pueda operar correctamente, debes organizar tu arquitectura en Google Drive siguiendo esta jerarquía exacta. El sistema "autodescubrirá" el resto basándose únicamente en el ID de la Carpeta Raíz.

---

## 1. Estructura de Carpetas OBLIGATORIA

Crea una carpeta principal en tu Drive (Nómbrale como desees, ej: "MI_APP_MOTOR") y dentro crea las siguientes subcarpetas con estos nombres exactos:

```text
[CARPETA_RAIZ] (Obtén su ID desde la URL de Drive)
├── 00_Configuraciones
│   └── Config (Google Sheets)
├── 01_Usuarios
│   └── DB_Usuarios (Google Sheets)
├── 02_Reportes
│   ├── DB_Reportes (Google Sheets)
│   ├── subconfig
│   └── Files
└── 03_Inspecciones (Próximo Módulo)
    ├── DB_Inspecciones (Google Sheets)
    ├── subconfig
    └── Files
```

---

## 2. Configuración de Archivos Core

### A. Carpeta `00_Configuraciones/`
Crea un **Google Sheets** llamado "Config".
*   **Pestaña:** `data`
*   **Columnas:** `ID_Modulo`, `Nombre`, `Logo`, `Roles_Visibles`, `Calidad_Compresion_F`
*   **Ejemplo de Fila:** `02_Reportes`, `Reportes Mensuales`, `assignment`, `Admin,Supervisor`, `Medio`

### B. Carpeta `01_Usuarios/`
Crea un **Google Sheets** llamado "DB_Usuarios".
*   **Columnas Obligatorias:** `UUID`, `DNI`, `Nombre_Completo`, `Email`, `Password_Hash`, `Rol`, `Status`, `Foto_Perfil`, `Firma_Cargo`
*   **Nota:** El campo `Status` debe aceptar el valor **"Cesado"** para el bloqueo automático.

---

## 3. Vinculación en el Código (Apps Script)

Abre tu archivo `00_Config/Code.gs` y busca el bloque inicial de configuración. Debes pegar el ID que obtuviste de la URL de tu carpeta raíz:

```javascript
const CONFIG = {
  // Pega aquí el ID de la carpeta principal que creaste en el paso 1
  ROOT_APP_FOLDER_ID: "TU_ID_DE_CARPETA_AQUÍ", 
  
  APP_VERSION: "1.0.0",
  MODULE_USERS_NAME: "01_Usuarios"
};
```

---

## 4. Skills y Reglas de Oro

1.  **UUID**: Nunca añadas filas manualmente a los Sheets. Deja que la App genere los UUIDs para evitar errores de sobreescritura.
2.  **Módulos Nuevos**: Para añadir un módulo 04, simplemente crea la carpeta `04_ModuloNombre` en Drive y regístralo en el Sheets `Config`. El código NO se toca.
3.  **Habilitación de Módulo**: Los usuarios solo verán los módulos que su ROL tenga permitido en el Sheets de configuraciones.
