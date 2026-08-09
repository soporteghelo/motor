# 🏗️ Esquema de Arquitectura: MOTOR PWA ZERO-TOUCH

Este documento detalla la ingeniería y la interconexión de componentes del sistema en su estado actual.

## 1. Stack Tecnológico
*   **Frontend**: SPA (Single Page Application) basada en **HTML5 / Tailwind CSS 3**.
*   **Backend**: Motor monolítico en **Google Apps Script (V8 Engine)**.
*   **Base de Datos**: Relacional distribuida en **Google Sheets** (pestañas MAIN/CHILD).
*   **Almacenamiento**: Jerárquico en **Google Drive** (Motor de autodescubrimiento).
*   **Resiliencia**: Persistencia local vía **IndexedDB** para operaciones 100% Offline.

## 2. Flujo de Datos (Arquitectura de Sincronización)
1.  **Captura**: El usuario ingresa datos en el móvil. Los archivos se comprimen en el cliente (Skill A).
2.  **Encolado**: Los datos se guardan en el `Offline_Engine` (IndexedDB) con estatus "Pendiente".
3.  **Transmisión**: Al detectar internet, se envía un `Batch` (lote) JSON al `serverRouter` en `Code.gs`.
4.  **Procesamiento Atómico**:
    *   El servidor valida la sesión y el token (SHA-256).
    *   Autodescubre la infraestructura en Drive (Zero-Touch).
    *   Inyecta filas en `MAIN` y `CHILD` simultáneamente.
    *   Dispara la **Skill 10** (Mail-Merge) si existe una plantilla vinculada.

## 3. Seguridad y Privacidad
*   **Cifrado**: Contraseñas protegidas mediante **SHA-256** antes de salir del dispositivo.
*   **Aislamiento**: Cada módulo reside en su propia carpeta de Drive con permisos granulares.
*   **Validación**: Control de estatus "Cesado" que bloquea el ruteo de cualquier acción si el usuario es dado de baja.

## 4. Mapa Maestro de Infraestructura y Flujo de Datos

```mermaid
flowchart TD
    subgraph CLIENT_SIDE [📱 Capa de Cliente: PWA Móvil / Desktop]
        UI[<b>Interfaz Premium</b><br/>Tailwind CSS 3 + Material 3]
        RT[<b>App_Routing</b><br/>SPA Router & View Segregation]
        
        subgraph SKILLS [⚡ Global_Skills: Motor de Lógica]
            SHA[Cifrado SHA-256]
            IMG[Compresión Imágenes]
            REF[Lógica de Slices / Ref]
            DRW[Dynamic Rows Engine]
        end
        
        subgraph OFFLINE [📦 Capa de Resiliencia]
            IDB[(<b>IndexedDB</b><br/>Persistencia Offline)]
            OE[<b>Offline_Engine</b><br/>Queue Manager & Sync Tracker]
        end
    end

    subgraph CLOUD_INFRA [☁️ Infraestructura Google Cloud / Apps Script]
        SRV[<b>serverRouter</b><br/>Punto de Entrada Atómico]
        ZT[<b>Zero-Touch Engine</b><br/>Auto-Discovery & Cache ID]
        
        subgraph SECURITY [🛡️ Seguridad Capa 2]
            AUTH[Validador de Token / Acceso]
            ST[System Health Check]
        end

        subgraph STORAGE [📊 Almacenamiento Relacional]
            SHEET[(<b>Google Sheets</b><br/>Tablas MAIN / CHILD)]
            DRIVE[[<b>Google Drive</b><br/>FileSystem Jerárquico]]
        end
        
        subgraph AUTO [🤖 Automatización de Procesos]
            PDF[Generador PDF via Template]
            MAIL[Mail-Merge Skills via G-Docs]
        end
    end

    %% Conexiones de Datos
    UI -->|Ingreso Datos| SKILLS
    SKILLS -->|Data Sanity| IDB
    IDB <-->|Sync Bidireccional| OE
    OE -->|Web App URL| SRV
    
    SRV -->|LockService| SECURITY
    SECURITY -->|Query| ZT
    ZT -->|Open| STORAGE
    
    STORAGE -->|Trigger Post-Sync| AUTO
    AUTO -->|Cierre Proceso| EMAIL(Notificación Final)
    
    %% Configuración
    GC{<b>Global_Config</b>}
    GC -.->|Colores/Rutas| UI
    GC -.->|Endpoints| SRV
    
    SBC{<b>Subconfig Modulares</b>}
    SBC -.->|Esquemas/Refs| SKILLS
    SBC -.->|Tablas/Templates| ZT
```

---
**Versión de Documentación: 1.2.0**
