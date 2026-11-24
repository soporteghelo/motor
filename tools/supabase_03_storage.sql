-- =========================================================================
-- MOTOR PWA · Almacenamiento de archivos
--
-- Sustituye a Google Drive. Tres buckets según cómo se sirve el archivo:
--
--   evidencias  privado · fotos, firmas y adjuntos de los registros
--   documentos  privado · PDF generados y archivos de gestión
--   informes    privado · el informe PDF de cada registro (derivado)
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
  ('informes',   'informes',   false, 10485760, array['application/pdf']),
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
    when '11_Webs' then return exists (select 1 from webs t where t.uuid = v_id);
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

create or replace function storage_puede_archivar(ruta text) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  if auth_rol() = 'superadmin' then return true; end if;
  if storage_empresa(ruta) is distinct from auth_empresa() then return false; end if;
  case v_mod
    when '02_Reportes' then return exists (
      select 1 from reportes t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and t.creado_por_dni = auth_dni()) or t.creado_por_dni = auth_dni()));
    when '03_Inspecciones' then return exists (
      select 1 from inspecciones t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.auditor_dni = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '04_Actos_Condiciones' then return exists (
      select 1 from actos_condiciones t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.moderado_por = auth_dni() or t.reportado_por = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '05_Incidentes' then return exists (
      select 1 from incidentes t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.trabajador_dni = auth_dni() or t.reportado_por = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '06_Capacitaciones' then return exists (
      select 1 from capacitaciones t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and t.creado_por_dni = auth_dni()) or t.creado_por_dni = auth_dni()));
    when '07_IPERC' then return exists (
      select 1 from iperc t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.revisado_por = auth_dni() or t.elaborado_por = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '08_PETAR' then return exists (
      select 1 from petar t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.supervisor_dni = auth_dni() or t.aprobado_por = auth_dni() or t.ejecutante_dni = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '09_EPP' then return exists (
      select 1 from epp t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.entregado_por = auth_dni() or t.trabajador_dni = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '10_Charlas' then return exists (
      select 1 from charlas t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or (auth_rol() = 'supervisor' and (t.creado_por_dni = auth_dni() or t.expositor_dni = auth_dni())) or t.creado_por_dni = auth_dni()));
    when '11_Webs' then return exists (
      select 1 from webs t
       where t.uuid = v_id
         and (auth_rol() = 'admin' or t.creado_por_dni = auth_dni()));
    else return false;
  end case;
end $$;

create or replace function informe_huerfano(ruta text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_mod text := split_part(ruta, '/', 2);
  v_id  text := split_part(ruta, '/', 3);
begin
  case v_mod
    when '02_Reportes' then return not exists (select 1 from reportes t where t.uuid = v_id);
    when '03_Inspecciones' then return not exists (select 1 from inspecciones t where t.uuid = v_id);
    when '04_Actos_Condiciones' then return not exists (select 1 from actos_condiciones t where t.uuid = v_id);
    when '05_Incidentes' then return not exists (select 1 from incidentes t where t.uuid = v_id);
    when '06_Capacitaciones' then return not exists (select 1 from capacitaciones t where t.uuid = v_id);
    when '07_IPERC' then return not exists (select 1 from iperc t where t.uuid = v_id);
    when '08_PETAR' then return not exists (select 1 from petar t where t.uuid = v_id);
    when '09_EPP' then return not exists (select 1 from epp t where t.uuid = v_id);
    when '10_Charlas' then return not exists (select 1 from charlas t where t.uuid = v_id);
    when '11_Webs' then return not exists (select 1 from webs t where t.uuid = v_id);
    else return false;
  end case;
end $$;
revoke all on function informe_huerfano(text) from public;
grant execute on function informe_huerfano(text) to authenticated;

-- ── bucket informes (privado · un PDF por registro) ──
drop policy if exists informes_sel on storage.objects;
create policy informes_sel on storage.objects for select using (
  bucket_id = 'informes' and storage_puede_leer(name)
);
drop policy if exists informes_ins on storage.objects;
create policy informes_ins on storage.objects for insert with check (
  bucket_id = 'informes' and storage_puede_archivar(name)
);
-- Sobrescribir es lo normal aquí: el informe se regenera con cada cambio del
-- registro y su nombre no cambia (uno por registro, no uno por edición).
drop policy if exists informes_upd on storage.objects;
create policy informes_upd on storage.objects for update using (
  bucket_id = 'informes' and storage_puede_archivar(name)
) with check (
  bucket_id = 'informes' and storage_puede_archivar(name)
);
-- Se borra al eliminar el registro: quien podía reescribirlo o, cuando el
-- registro ya no existe (informe huérfano), quien pueda verlo dentro de su
-- empresa. En la práctica eso es el Admin, que es el único rol con canDelete
-- en los diez módulos y, por tanto, el único que llega a este caso: la app
-- borra primero el registro y después su informe.
drop policy if exists informes_del on storage.objects;
create policy informes_del on storage.objects for delete using (
  bucket_id = 'informes' and (
       storage_puede_archivar(name)
    or (storage_empresa(name) = auth_empresa() and informe_huerfano(name))
  )
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