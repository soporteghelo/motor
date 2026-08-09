-- =========================================================================
-- MOTOR PWA · Almacenamiento de archivos
--
-- Sustituye a Google Drive. Tres buckets según cómo se sirve el archivo:
--
--   evidencias  privado · fotos, firmas y adjuntos de los registros
--   documentos  privado · PDF generados y archivos de gestión
--   publico     público · logos y recursos de marca de cada empresa
--
-- CONVENCIÓN DE RUTAS  <empresa_id>/<modulo>/<uuid>/<campo>_<n>.<ext>
-- La empresa va PRIMERO en la ruta: así la política puede aislar por
-- carpeta sin consultar ninguna tabla.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('documentos', 'documentos', false, 26214400,
   array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/msword','application/vnd.ms-excel','text/csv','image/jpeg','image/png']),
  ('publico',    'publico',    true,   2097152,
   array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- El primer segmento de la ruta es la empresa: (storage.foldername(name))[1]
create or replace function storage_empresa(ruta text) returns uuid as $$
  select nullif((storage.foldername(ruta))[1], '')::uuid;
$$ language sql stable;

-- ── bucket evidencias (privado) ──
drop policy if exists evidencias_sel on storage.objects;
create policy evidencias_sel on storage.objects for select using (
  bucket_id = 'evidencias' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists evidencias_ins on storage.objects;
create policy evidencias_ins on storage.objects for insert with check (
  bucket_id = 'evidencias' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists evidencias_upd on storage.objects;
create policy evidencias_upd on storage.objects for update using (
  bucket_id = 'evidencias' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Borrar evidencia es destruir prueba: reservado a admin y proveedor.
drop policy if exists evidencias_del on storage.objects;
create policy evidencias_del on storage.objects for delete using (
  bucket_id = 'evidencias' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);

-- ── bucket documentos (privado) ──
drop policy if exists documentos_sel on storage.objects;
create policy documentos_sel on storage.objects for select using (
  bucket_id = 'documentos' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists documentos_ins on storage.objects;
create policy documentos_ins on storage.objects for insert with check (
  bucket_id = 'documentos' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
drop policy if exists documentos_upd on storage.objects;
create policy documentos_upd on storage.objects for update using (
  bucket_id = 'documentos' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Borrar evidencia es destruir prueba: reservado a admin y proveedor.
drop policy if exists documentos_del on storage.objects;
create policy documentos_del on storage.objects for delete using (
  bucket_id = 'documentos' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);

-- ── bucket publico (lectura abierta, escritura del admin) ──
drop policy if exists publico_sel on storage.objects;
create policy publico_sel on storage.objects for select using (bucket_id = 'publico');
drop policy if exists publico_mod on storage.objects;
create policy publico_mod on storage.objects for all using (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
                        and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
) with check (
  bucket_id = 'publico' and auth_rol() in ('superadmin','admin')
);

-- Campos de archivo detectados en los subconfigs:
--   02_Reportes: Evidencia_Fotografica (Image), Firma_Operario (Signature)
--   03_Inspecciones: Evidencia_Fotos (Image_Collection), Firma_Digital (Signature)
--   04_Actos_Condiciones: Evidencia_Foto (Image)
--   05_Incidentes: Evidencia_Fotos (Image_Collection), Firma_Investigador (Signature)
--   06_Capacitaciones: Registro_Firmas (Image_Collection), Material (File)
--   07_IPERC: Firma_Responsable (Signature)
--   08_PETAR: Firma_Solicitante (Signature), Firma_Aprobador (Signature)
--   09_EPP: Firma_Trabajador (Signature), Foto_Cargo (Image_Collection)
--   10_Charlas: Firma_Expositor (Signature), Foto_Charla (Image_Collection)