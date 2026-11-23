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
         'application/msword','application/vnd.ms-excel','text/csv','text/plain',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-powerpoint','image/jpeg','image/png']),
  ('publico',    'publico',    true,   2097152,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Sin image/svg+xml en publico: un SVG puede llevar <script> y se serviría
-- desde un dominio público como contenido activo.

-- El primer segmento de la ruta es la empresa: (storage.foldername(name))[1].
-- Si no es un uuid (p. ej. "sin-empresa/…") devuelve NULL en vez de lanzar
-- un error de conversión que rompería el listado entero.
create or replace function storage_empresa(ruta text) returns uuid as $$
  select case when (storage.foldername(ruta))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(ruta))[1])::uuid end;
$$ language sql stable;

create or replace function storage_puede_leer(ruta text) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  if auth_rol() = 'superadmin' then return true; end if;
  if storage_empresa(ruta) is distinct from auth_empresa() then return false; end if;
  if auth_rol() = 'admin' then return true; end if;
  case v_mod
    when '02_Reportes' then return exists (select 1 from reportes t where t.uuid = v_id);
    when '03_Inspecciones' then return exists (select 1 from inspecciones t where t.uuid = v_id);
    when '04_Actos_Condiciones' then return exists (select 1 from actos_condiciones t where t.uuid = v_id);
    when '05_Incidentes' then return exists (select 1 from incidentes t where t.uuid = v_id);
    when '06_Capacitaciones' then return exists (select 1 from capacitaciones t where t.uuid = v_id);
    when '07_IPERC' then return exists (select 1 from iperc t where t.uuid = v_id);
    when '08_PETAR' then return exists (select 1 from petar t where t.uuid = v_id);
    when '09_EPP' then return exists (select 1 from epp t where t.uuid = v_id);
    when '10_Charlas' then return exists (select 1 from charlas t where t.uuid = v_id);
    -- Foto y firma del personal: las ve quien puede ver a esa persona
    when '01_Usuarios' then return exists (select 1 from usuarios u where u.id::text = v_id);
    else return false;
  end case;
end $$;

-- ── bucket evidencias (privado) ──
drop policy if exists evidencias_sel on storage.objects;
create policy evidencias_sel on storage.objects for select using (
  bucket_id = 'evidencias' and storage_puede_leer(name)
);
drop policy if exists evidencias_ins on storage.objects;
create policy evidencias_ins on storage.objects for insert with check (
  bucket_id = 'evidencias' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Sobrescribir una evidencia equivale a destruirla: igual que borrar, solo
-- admin y proveedor. La app sube cada archivo con nombre único y sin upsert.
drop policy if exists evidencias_upd on storage.objects;
create policy evidencias_upd on storage.objects for update using (
  bucket_id = 'evidencias' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
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
  bucket_id = 'documentos' and storage_puede_leer(name)
);
drop policy if exists documentos_ins on storage.objects;
create policy documentos_ins on storage.objects for insert with check (
  bucket_id = 'documentos' and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
);
-- Sobrescribir una evidencia equivale a destruirla: igual que borrar, solo
-- admin y proveedor. La app sube cada archivo con nombre único y sin upsert.
drop policy if exists documentos_upd on storage.objects;
create policy documentos_upd on storage.objects for update using (
  bucket_id = 'documentos' and auth_rol() in ('superadmin','admin')
                     and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
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
                        and (auth_rol() = 'superadmin' or storage_empresa(name) = auth_empresa())
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