-- CRM-owned customer avatars (customers.avatar_url + tenant-scoped storage).
-- Provider/Meta profile photos are intentionally out of scope.

alter table public.customers
  add column if not exists avatar_url text;

comment on column public.customers.avatar_url is
  'Optional CRM-owned customer photo public URL from the customer-avatars bucket. Never provider-derived.';

-- Accept only null/empty or URLs/paths owned by this customer under customer-avatars.
create or replace function public.is_owned_customer_avatar_url(
  p_company_id uuid,
  p_customer_id uuid,
  p_url text
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_url text;
  v_prefix text;
  v_object text;
  v_marker text := '/storage/v1/object/public/customer-avatars/';
  v_idx int;
  v_filename text;
begin
  if p_url is null then
    return true;
  end if;

  v_url := trim(p_url);
  if v_url = '' then
    return true;
  end if;

  if p_company_id is null or p_customer_id is null then
    return false;
  end if;

  if length(v_url) > 2048 then
    return false;
  end if;

  -- Block unsafe schemes early (browser must not inject javascript:/data: payloads).
  if v_url ~* '^(javascript|data:|vbscript|file|blob):' then
    return false;
  end if;

  v_prefix := p_company_id::text || '/customers/' || p_customer_id::text || '/';

  -- Storage object path (without bucket id): company_id/customers/customer_id/file
  if position('/' in substring(v_url from length(v_prefix) + 1)) = 0
     and v_url like (v_prefix || '%')
     and length(v_url) > length(v_prefix) then
    v_filename := substring(v_url from length(v_prefix) + 1);
    if v_filename ~ '^[a-zA-Z0-9._-]+$' then
      return true;
    end if;
  end if;

  -- Public HTTPS/HTTP URL for this bucket + owned object prefix.
  if v_url ~ '^https?://' then
    v_idx := position(v_marker in v_url);
    if v_idx = 0 then
      return false;
    end if;
    v_object := substring(v_url from v_idx + length(v_marker));
    -- Strip query/fragment used for cache busting.
    v_object := split_part(split_part(v_object, '?', 1), '#', 1);
    v_object := replace(v_object, '%2F', '/');
    if v_object like (v_prefix || '%')
       and position('/' in substring(v_object from length(v_prefix) + 1)) = 0
       and length(v_object) > length(v_prefix) then
      v_filename := substring(v_object from length(v_prefix) + 1);
      if v_filename ~ '^[a-zA-Z0-9._-]+$' then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.customers_avatar_url_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;

  if new.avatar_url is null or trim(new.avatar_url) = '' then
    new.avatar_url := null;
    return new;
  end if;

  if not public.is_owned_customer_avatar_url(new.company_id, new.id, new.avatar_url) then
    raise exception 'Invalid customer avatar_url for tenant-owned storage';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_avatar_url_guard on public.customers;
create trigger customers_avatar_url_guard
  before insert or update of avatar_url on public.customers
  for each row
  execute function public.customers_avatar_url_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-avatars',
  'customer-avatars',
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

-- Public read for display URLs (path contains company + customer UUIDs; writes remain RBAC-gated).
drop policy if exists customer_avatars_storage_select on storage.objects;
create policy customer_avatars_storage_select
on storage.objects for select
to public
using (bucket_id = 'customer-avatars');

drop policy if exists customer_avatars_storage_insert on storage.objects;
create policy customer_avatars_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = public.current_company_id()::text
  and (storage.foldername(name))[2] = 'customers'
  and exists (
    select 1
    from public.customers c
    where c.id::text = (storage.foldername(name))[3]
      and c.company_id = public.current_company_id()
  )
  and (
    public.is_super_admin()
    or public.company_has_permission(public.current_company_id(), 'customers.edit')
  )
);

drop policy if exists customer_avatars_storage_update on storage.objects;
create policy customer_avatars_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = public.current_company_id()::text
  and (storage.foldername(name))[2] = 'customers'
  and exists (
    select 1
    from public.customers c
    where c.id::text = (storage.foldername(name))[3]
      and c.company_id = public.current_company_id()
  )
  and (
    public.is_super_admin()
    or public.company_has_permission(public.current_company_id(), 'customers.edit')
  )
)
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = public.current_company_id()::text
  and (storage.foldername(name))[2] = 'customers'
  and exists (
    select 1
    from public.customers c
    where c.id::text = (storage.foldername(name))[3]
      and c.company_id = public.current_company_id()
  )
);

drop policy if exists customer_avatars_storage_delete on storage.objects;
create policy customer_avatars_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = public.current_company_id()::text
  and (storage.foldername(name))[2] = 'customers'
  and exists (
    select 1
    from public.customers c
    where c.id::text = (storage.foldername(name))[3]
      and c.company_id = public.current_company_id()
  )
  and (
    public.is_super_admin()
    or public.company_has_permission(public.current_company_id(), 'customers.edit')
  )
);
