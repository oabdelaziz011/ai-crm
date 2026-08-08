-- Sprint 3.10.6 — Public avatars bucket for profiles.avatar_url storage paths
-- + allow company-scoped default_currency (CompanyLocaleProvider source).

update public.billing_setting_definitions
set
  scope_type = 'both',
  description = 'Default billing currency for invoices, payments, reports, and AI usage'
where code = 'default_currency';

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

drop policy if exists "avatars_storage_select" on storage.objects;
create policy "avatars_storage_select"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_storage_insert" on storage.objects;
create policy "avatars_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_storage_update" on storage.objects;
create policy "avatars_storage_update"
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

drop policy if exists "avatars_storage_delete" on storage.objects;
create policy "avatars_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
