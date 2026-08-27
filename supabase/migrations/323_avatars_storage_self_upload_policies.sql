-- ============================================================
-- 323 — Restore avatars self-upload Storage RLS
--
-- Root cause: migration 290 dropped public SELECT on `avatars`.
-- Profile photo upload uses upsert semantics (x-upsert / storage
-- upsert), which requires SELECT to check object existence plus
-- INSERT/UPDATE on the caller's own folder. Without SELECT,
-- authenticated uploads fail with 403 / RLS "forbidden".
--
-- Keep listing locked down: SELECT is limited to the caller's own
-- folder (auth.uid()), not a public list of every avatar. Public
-- object URLs via /object/public/... still work for public buckets.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Own-folder SELECT (needed for upsert existence checks / SDK upload)
drop policy if exists avatars_storage_select_own on storage.objects;
drop policy if exists "avatars_storage_select_own" on storage.objects;
create policy avatars_storage_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_storage_insert on storage.objects;
drop policy if exists "avatars_storage_insert" on storage.objects;
create policy avatars_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_storage_update on storage.objects;
drop policy if exists "avatars_storage_update" on storage.objects;
create policy avatars_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_storage_delete on storage.objects;
drop policy if exists "avatars_storage_delete" on storage.objects;
create policy avatars_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
