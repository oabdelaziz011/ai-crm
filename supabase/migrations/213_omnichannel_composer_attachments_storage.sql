-- Sprint 11: Omnichannel composer attachment storage bucket + RLS

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-attachments',
  'conversation-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "conversation_attachments_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'conversation-attachments'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

create policy "conversation_attachments_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'conversation-attachments'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

create policy "conversation_attachments_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'conversation-attachments'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);
