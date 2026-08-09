# 📧 Guía de Creación de Plantillas Automatizadas

Esta guía explica cómo configurar el sistema de **Mail-Merge** para que tu PWA envíe correos electrónicos profesionales automáticamente.

## 1. Creación de la Plantilla en Google Docs
1. Crea un nuevo **Google Doc** en tu unidad de Drive.
2. Diseña el cuerpo del correo como desees (puedes usar negritas, colores, etc.).
3. **Mapeo de Variables**: Para inyectar datos del formulario, utiliza la sintaxis de doble corchete: `<<[NOMBRE_CAMPO]>>`.
   * Ejemplo: *Estimado <<[Nombre_Completo]>>, su reporte con DNI <<[DNI]>> ha sido recibido.*

## 2. Soporte para Tablas Hijas (Relacionales)
Si tu módulo tiene una `CHILD_TABLE`, puedes inyectar todos los registros secundarios usando la etiqueta especial:
* **`<<[TABLA_HIJA]>>`**: El sistema reemplazará esta etiqueta por una lista detallada de todos los hallazgos o items registrados en el mismo envío.

## 3. Configuración en la App
Una vez creada la plantilla:
1. Copia el **ID del Documento** de la URL (ej: `docs.google.com/document/d/ESTE_ID_DE_AQUI/edit`).
2. Abre el archivo `subconfig` de tu módulo.
3. Pega el ID en la propiedad `EMAIL_TEMPLATE_ID`.
4. El sistema enviará el correo automáticamente al finalizar la sincronización atómica.

---
> [!TIP]
> Puedes usar variables como `<<[UUID]>>` para proporcionar un número de ticket único al usuario en el asunto o cuerpo del correo.
