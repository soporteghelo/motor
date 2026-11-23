-- =========================================================================
-- MOTOR PWA · Bucket de actualizaciones por aire (OTA)
--
-- Escrito a mano (no lo genera gen_supabase.js: no depende de los subconfigs).
-- Idempotente: se puede volver a ejecutar.
--
-- QUÉ GUARDA
--   bundles/bundle-<version>.zip   el dist/ comprimido que descarga la app
--   latest.json                    qué versión es la vigente
--
-- POR QUÉ UN BUCKET APARTE Y NO "publico"
--   1. "publico" tiene un tope de 2 MB y solo acepta imágenes: es para logos.
--   2. Aquí vive CÓDIGO EJECUTABLE. Quien pueda escribir en este bucket
--      ejecuta lo que quiera en los teléfonos de la empresa. Separarlo
--      permite una política de escritura mucho más estricta.
--
-- QUIÉN PUEDE ESCRIBIR
--   NADIE por la API. Ni Admin, ni SuperAdmin, ni la anon key: no se crea
--   ninguna política de insert/update/delete, así que RLS lo niega todo.
--   Solo sube la service_role (tools/ota_publish.js desde tu máquina o tu
--   CI), que no pasa por RLS. Un XSS o un token robado NO alcanzan para
--   publicar una actualización.
--
-- QUIÉN PUEDE LEER
--   Cualquiera. El bundle es el mismo código que ya está en el APK y en la
--   web pública: no hay secreto que proteger, y el teléfono debe poder
--   descargarlo antes de iniciar sesión. La integridad no la da el secreto,
--   la da el SHA-256 que el plugin verifica en nativo.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actualizaciones', 'actualizaciones', true, 52428800,
        array['application/zip', 'application/json'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública. Un bucket `public = true` ya se sirve por
-- /object/public/..., pero la política explícita cubre también la API
-- autenticada y deja constancia de la intención.
drop policy if exists "ota lectura publica" on storage.objects;
create policy "ota lectura publica" on storage.objects
  for select using (bucket_id = 'actualizaciones');

-- Sin políticas de insert, update ni delete: a propósito.
-- Si algún día quisieras permitir que un SuperAdmin publique desde la app
-- (NO recomendado: sería un XSS a un paso de ejecutar código en todos los
-- teléfonos), tendría que añadirse aquí una política de insert.
drop policy if exists "ota escritura" on storage.objects;

-- Comprobación rápida de que quedó bien:
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'actualizaciones';
