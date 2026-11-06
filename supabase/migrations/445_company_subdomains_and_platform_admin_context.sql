-- Local migration 445. Do not apply to Production.
-- Adds a stable company subdomain and a short-lived Super Admin company context.
-- Company id does not change when the subdomain changes.
-- Migration 444 is left intact. Migration 443 is not applied here.
--
-- Rollback:
--   drop function if exists public.close_platform_company_context(uuid);
--   drop function if exists public.open_platform_company_context(uuid);
--   drop function if exists public.assert_tenant_host_access(text);
--   drop function if exists public.resolve_company_by_host(text);
--   drop function if exists public.set_company_subdomain(uuid, text);
--   drop function if exists public.allocate_company_subdomain(text, uuid);
--   drop function if exists public.normalize_company_subdomain(text);
--   drop trigger if exists trg_companies_assign_subdomain on public.companies;
--   drop function if exists public.assign_company_subdomain();
--   drop table if exists public.platform_admin_contexts;
--   drop index if exists public.companies_subdomain_unique;
--   alter table public.companies drop column if exists subdomain;

alter table public.companies
  add column if not exists subdomain text;

comment on column public.companies.subdomain is
  'Public hostname label. Unique. Not the company primary key.';

create unique index if not exists companies_subdomain_unique
  on public.companies (lower(subdomain))
  where subdomain is not null;

create or replace function public.normalize_company_subdomain(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  reserved text[] := array[
    'app','api','admin','www','mail','smtp','ftp','localhost','valueor','platform',
    'support','billing','webhook','webhooks','static','cdn','status','docs','help',
    'auth','login','dashboard','superadmin','root','ns1','ns2','staging','test','dev'
  ];
begin
  v := lower(trim(coalesce(p_value, '')));
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, '(^-+|-+$)', '', 'g');
  v := left(v, 40);
  v := regexp_replace(v, '-+$', '', 'g');
  if v is null or length(v) < 3 then
    return null;
  end if;
  if v = any (reserved) then
    return null;
  end if;
  if v !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function public.allocate_company_subdomain(p_name text, p_exclude uuid default null)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  base := public.normalize_company_subdomain(p_name);
  if base is null then
    base := 'company';
  end if;
  candidate := base;
  while exists (
    select 1
    from public.companies c
    where lower(c.subdomain) = candidate
      and (p_exclude is null or c.id <> p_exclude)
  ) loop
    candidate := left(base, 36) || '-' || n::text;
    n := n + 1;
    if n > 100 then
      raise exception 'subdomain_collision';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.assign_company_subdomain()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_super_admin() then
    raise exception 'forbidden';
  end if;
  if new.subdomain is null or length(trim(new.subdomain)) = 0 then
    new.subdomain := public.allocate_company_subdomain(new.name, new.id);
  else
    new.subdomain := public.normalize_company_subdomain(new.subdomain);
    if new.subdomain is null then
      raise exception 'subdomain_invalid';
    end if;
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then
    insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
    values (
      auth.uid(), null, 'CREATE', 'company_subdomain', new.id::text,
      jsonb_build_object(
        'scope', 'platform',
        'event', 'subdomain_created',
        'actor_scope', case when public.is_super_admin() then 'super_admin' else 'tenant' end,
        'company_id', new.id,
        'subdomain', new.subdomain
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_companies_assign_subdomain on public.companies;
create trigger trg_companies_assign_subdomain
  before insert or update of subdomain on public.companies
  for each row execute procedure public.assign_company_subdomain();

do $$
declare
  r record;
begin
  for r in
    select id, name
    from public.companies
    where subdomain is null
    order by created_at, id
  loop
    update public.companies
    set subdomain = public.allocate_company_subdomain(r.name, r.id)
    where id = r.id
      and subdomain is null;
  end loop;
end $$;

create table if not exists public.platform_admin_contexts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists platform_admin_contexts_actor_active_idx
  on public.platform_admin_contexts (actor_id, company_id)
  where revoked_at is null;

alter table public.platform_admin_contexts enable row level security;

drop policy if exists platform_admin_contexts_select on public.platform_admin_contexts;
create policy platform_admin_contexts_select
  on public.platform_admin_contexts for select
  using (
    public.is_super_admin()
    and actor_id = auth.uid()
  );

revoke all on public.platform_admin_contexts from public, anon, authenticated;
grant select on public.platform_admin_contexts to authenticated;

create or replace function public.resolve_company_by_host(p_host text)
returns table (
  company_id uuid,
  subdomain text,
  status text,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host text := lower(split_part(trim(coalesce(p_host, '')), ':', 1));
  v_label text;
  v_root text;
  v_reserved text[] := array[
    'app','api','admin','www','mail','smtp','ftp','localhost','valueor','platform',
    'support','billing','webhook','webhooks','static','cdn','status','docs','help',
    'auth','login','dashboard','superadmin','root','ns1','ns2','staging','test','dev'
  ];
begin
  if v_host in ('', 'localhost', '127.0.0.1', '[::1]') then
    return query select null::uuid, null::text, null::text, 'platform'::text;
    return;
  end if;

  if v_host = 'valueor.org' or v_host like '%.localhost' or v_host like '%.valueor.org' then
    if v_host like '%.localhost' then
      v_root := 'localhost';
    elsif v_host = 'valueor.org' then
      return query select null::uuid, null::text, null::text, 'platform'::text;
      return;
    else
      v_root := 'valueor.org';
    end if;
    v_label := left(v_host, length(v_host) - length(v_root) - 1);
    if v_label like '%.%' or v_label = any (v_reserved) or v_label in ('app', 'www') then
      return query select null::uuid, null::text, null::text, 'platform'::text;
      return;
    end if;
    return query
      select c.id, c.subdomain, c.status,
        case
          when c.id is null then 'unknown_host'
          when c.status = 'Suspended' then 'inactive'
          when coalesce(c.approval_status, '') = 'rejected' then 'inactive'
          else 'ok'
        end
      from (select 1) seed
      left join public.companies c on lower(c.subdomain) = v_label;
    return;
  end if;

  return query select null::uuid, null::text, null::text, 'ignore'::text;
end;
$$;

create or replace function public.assert_tenant_host_access(p_host text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select * into v_row from public.resolve_company_by_host(p_host) limit 1;
  if v_row.reason in ('platform', 'ignore') then
    return v_row.reason;
  end if;
  if v_row.reason = 'unknown_host' then
    return 'unknown_host';
  end if;
  if v_row.reason = 'inactive' then
    return 'inactive';
  end if;
  if v_uid is null then
    return 'unauthenticated';
  end if;

  select p.company_id into v_company
  from public.profiles p
  where p.id = v_uid or p.user_id = v_uid
  order by case when p.id = v_uid then 0 else 1 end
  limit 1;

  if v_company = v_row.company_id then
    return 'ok';
  end if;

  if public.is_super_admin() and exists (
    select 1
    from public.platform_admin_contexts ctx
    where ctx.actor_id = v_uid
      and ctx.company_id = v_row.company_id
      and ctx.revoked_at is null
      and ctx.expires_at > now()
  ) then
    return 'ok';
  end if;

  return 'forbidden';
end;
$$;

create or replace function public.open_platform_company_context(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select status into v_status from public.companies where id = p_company_id;
  if v_status is null then
    raise exception 'company_not_found';
  end if;

  update public.platform_admin_contexts
  set revoked_at = now()
  where actor_id = v_uid and revoked_at is null;

  insert into public.platform_admin_contexts (actor_id, company_id, expires_at)
  values (v_uid, p_company_id, now() + interval '2 hours')
  returning id into v_id;

  insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
  values (
    v_uid, p_company_id, 'CREATE', 'platform_admin_context', v_id::text,
    jsonb_build_object('scope', 'platform', 'event', 'open_company', 'actor_scope', 'super_admin', 'context_id', v_id)
  );
  return v_id;
end;
$$;

create or replace function public.close_platform_company_context(p_context_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;
  update public.platform_admin_contexts
  set revoked_at = now()
  where id = p_context_id
    and actor_id = v_uid
    and revoked_at is null
  returning company_id into v_company;
  if v_company is null then
    raise exception 'context_not_found';
  end if;
  insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
  values (
    v_uid, v_company, 'UPDATE', 'platform_admin_context', p_context_id::text,
    jsonb_build_object('scope', 'platform', 'event', 'close_company', 'actor_scope', 'super_admin', 'context_id', p_context_id)
  );
end;
$$;

create or replace function public.set_company_subdomain(p_company_id uuid, p_subdomain text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next text := public.normalize_company_subdomain(p_subdomain);
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;
  if v_next is null then
    raise exception 'subdomain_invalid';
  end if;
  if exists (
    select 1 from public.companies
    where lower(subdomain) = v_next and id <> p_company_id
  ) then
    raise exception 'subdomain_taken';
  end if;
  update public.companies
  set subdomain = v_next
  where id = p_company_id;
  if not found then
    raise exception 'company_not_found';
  end if;
  insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
  values (
    v_uid, p_company_id, 'UPDATE', 'company_subdomain', p_company_id::text,
    jsonb_build_object('scope', 'platform', 'event', 'subdomain_changed', 'actor_scope', 'super_admin', 'subdomain', v_next)
  );
  return v_next;
end;
$$;

revoke all on function public.normalize_company_subdomain(text) from public, anon;
revoke all on function public.allocate_company_subdomain(text, uuid) from public, anon;
revoke all on function public.resolve_company_by_host(text) from public, anon;
revoke all on function public.assert_tenant_host_access(text) from public, anon;
revoke all on function public.open_platform_company_context(uuid) from public, anon;
revoke all on function public.close_platform_company_context(uuid) from public, anon;
revoke all on function public.set_company_subdomain(uuid, text) from public, anon;

create or replace function public.record_platform_admin_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_super_admin() then
    return;
  end if;
  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'CREATE', 'platform_admin_session', v_uid::text,
    jsonb_build_object('scope', 'platform', 'event', 'super_admin_login', 'actor_scope', 'super_admin')
  );
end;
$$;

create or replace function public.log_platform_access_denied(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event text := lower(trim(coalesce(p_event, '')));
begin
  if v_uid is null then
    return;
  end if;
  if v_event not in ('tenant_host_denied', 'platform_route_denied', 'open_company_denied') then
    return;
  end if;
  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'UPDATE', 'platform_access', v_uid::text,
    jsonb_build_object(
      'scope', 'platform',
      'event', v_event,
      'actor_scope', case when public.is_super_admin() then 'super_admin' else 'tenant' end
    )
  );
end;
$$;

create or replace function public.audit_company_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and auth.uid() is not null then
    insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
    values (
      auth.uid(), new.id, 'UPDATE', 'company_status', new.id::text,
      jsonb_build_object(
        'scope', 'platform',
        'event', 'company_status_changed',
        'actor_scope', case when public.is_super_admin() then 'super_admin' else 'tenant' end,
        'status', new.status
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_companies_audit_status on public.companies;
create trigger trg_companies_audit_status
  after update of status on public.companies
  for each row execute procedure public.audit_company_status_change();

revoke all on function public.record_platform_admin_login() from public, anon;
revoke all on function public.log_platform_access_denied(text) from public, anon;
grant execute on function public.record_platform_admin_login() to authenticated;
grant execute on function public.log_platform_access_denied(text) to authenticated;

grant execute on function public.assert_tenant_host_access(text) to authenticated;
grant execute on function public.open_platform_company_context(uuid) to authenticated;
grant execute on function public.close_platform_company_context(uuid) to authenticated;
grant execute on function public.set_company_subdomain(uuid, text) to authenticated;

drop policy if exists audit_logs_hide_platform_from_tenants on public.audit_logs;
create policy audit_logs_hide_platform_from_tenants
  on public.audit_logs
  as restrictive
  for select
  using (
    public.is_super_admin()
    or coalesce(metadata->>'scope', '') <> 'platform'
  );
