-- Sprint 3.2 / 3.4 — Link entity_files to entity_activities + private storage bucket.
-- No new tables. activity_id is nullable so legacy files keep working.

alter table public.entity_files
  add column if not exists activity_id uuid references public.entity_activities(id) on delete set null;

create index if not exists idx_entity_files_activity
  on public.entity_files(tenant_id, activity_id)
  where deleted_at is null and activity_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'entity-files',
  'entity-files',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "entity_files_storage_select" on storage.objects;
create policy "entity_files_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'entity-files'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "entity_files_storage_insert" on storage.objects;
create policy "entity_files_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'entity-files'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "entity_files_storage_update" on storage.objects;
create policy "entity_files_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'entity-files'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
)
with check (
  bucket_id = 'entity-files'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "entity_files_storage_delete" on storage.objects;
create policy "entity_files_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'entity-files'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);
