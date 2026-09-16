-- =============================================================================
-- 350 — Fix customer-avatars Storage RLS column shadowing
-- =============================================================================
-- Root cause (verified live):
--   customer_avatars_storage_* policies used:
--     EXISTS (SELECT 1 FROM customers c
--             WHERE c.id::text = (storage.foldername(name))[3] ...)
--   Inside that subquery, unqualified `name` binds to customers.name
--   (display name), NOT storage.objects.name. Live pg_policies shows:
--     storage.foldername(c.name)
--   So the ownership EXISTS never matches a real object path → INSERT 403
--   even when current_company_id() / customers.edit / is_super_admin are true
--   when queried from the app.
--
-- Fix: SECURITY DEFINER helper takes the object path explicitly (347 pattern),
-- validates path company + authoritative customers.company_id + permission.
-- Does NOT weaken tenant isolation. Does NOT disable RLS.
-- =============================================================================

create or replace function internal.can_manage_customer_avatar(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_company_text text;
  v_entity_text text;
  v_customer_text text;
  v_company_id uuid;
  v_customer_id uuid;
  v_customer_company_id uuid;
  v_caller_company_id uuid;
begin
  if auth.role() is distinct from 'authenticated' then
    return false;
  end if;

  if p_object_name is null or length(trim(p_object_name)) = 0 then
    return false;
  end if;

  -- Reject path traversal / absolute paths before parsing.
  if position('..' in p_object_name) > 0
     or p_object_name like '/%'
     or p_object_name like '%\%' then
    return false;
  end if;

  v_company_text := (storage.foldername(p_object_name))[1];
  v_entity_text := (storage.foldername(p_object_name))[2];
  v_customer_text := (storage.foldername(p_object_name))[3];

  if v_company_text is null
     or v_entity_text is distinct from 'customers'
     or v_customer_text is null then
    return false;
  end if;

  begin
    v_company_id := v_company_text::uuid;
    v_customer_id := v_customer_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  -- Trusted company context from authenticated identity (not browser-supplied).
  v_caller_company_id := public.current_company_id();
  if v_caller_company_id is null then
    return false;
  end if;

  -- Path company folder must match caller company context.
  if v_company_id is distinct from v_caller_company_id then
    return false;
  end if;

  -- Authoritative customer ownership (DEFINER bypasses customers RLS for the
  -- ownership lookup; permission gate remains company_has_permission / SA).
  select c.company_id
    into v_customer_company_id
  from public.customers c
  where c.id = v_customer_id;

  if v_customer_company_id is null then
    return false;
  end if;

  if v_customer_company_id is distinct from v_company_id then
    return false;
  end if;

  return public.is_super_admin()
    or public.company_has_permission(v_customer_company_id, 'customers.edit');
end;
$$;

comment on function internal.can_manage_customer_avatar(text) is
  'Storage gate for customer-avatars: path company/customers/customer_id must match caller company + authoritative customer.company_id; then super-admin OR customers.edit.';

create or replace function public.can_manage_customer_avatar(p_object_name text)
returns boolean
language sql
stable
set search_path to public, internal
as $$
  select internal.can_manage_customer_avatar(p_object_name);
$$;

revoke all on function public.can_manage_customer_avatar(text) from public;
revoke all on function public.can_manage_customer_avatar(text) from anon;
revoke all on function internal.can_manage_customer_avatar(text) from public;
revoke all on function internal.can_manage_customer_avatar(text) from anon;
grant execute on function public.can_manage_customer_avatar(text) to authenticated, service_role;
grant execute on function internal.can_manage_customer_avatar(text) to authenticated, service_role;

drop policy if exists customer_avatars_storage_insert on storage.objects;
create policy customer_avatars_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'customer-avatars'
  and public.can_manage_customer_avatar(name)
);

drop policy if exists customer_avatars_storage_update on storage.objects;
create policy customer_avatars_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'customer-avatars'
  and public.can_manage_customer_avatar(name)
)
with check (
  bucket_id = 'customer-avatars'
  and public.can_manage_customer_avatar(name)
);

drop policy if exists customer_avatars_storage_delete on storage.objects;
create policy customer_avatars_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'customer-avatars'
  and public.can_manage_customer_avatar(name)
);

-- SELECT remains public-read for display URLs (unchanged from 349).
-- Writes stay authenticated + can_manage_customer_avatar.
