-- Reconcile missing avatars self-upload SELECT policy (OOB 323 partial apply).
-- Adds ONLY avatars_storage_select_own; does not touch bucket or other policies.

drop policy if exists avatars_storage_select_own on storage.objects;

create policy avatars_storage_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
