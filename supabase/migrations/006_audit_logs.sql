-- ============================================================
-- Vault OS – Audit Logs
-- ============================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  entity text not null,
  entity_id text,
  ip_address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists user_id uuid,
  add column if not exists company_id uuid,
  add column if not exists action text,
  add column if not exists entity text,
  add column if not exists entity_id text,
  add column if not exists ip_address text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

update public.audit_logs
set metadata = coalesce(metadata, '{}'::jsonb)
where metadata is null;

update public.audit_logs
set created_at = now()
where created_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audit_logs_company_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_company_id_fkey
      foreign key (company_id)
      references public.companies(id)
      on delete set null;
  end if;
exception
  when others then null;
end $$;

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity);

alter table public.audit_logs enable row level security;

create or replace function public.request_ip_address()
returns text
language plpgsql
stable
as $$
declare
  headers json;
  ip text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception
    when others then
      headers := null;
  end;

  if headers is not null then
    ip := coalesce(
      nullif(headers->>'x-forwarded-for', ''),
      nullif(headers->>'x-real-ip', ''),
      nullif(headers->>'cf-connecting-ip', '')
    );
  end if;

  if ip is null then
    ip := inet_client_addr()::text;
  end if;

  if ip is not null and position(',' in ip) > 0 then
    ip := split_part(ip, ',', 1);
  end if;

  return nullif(trim(ip), '');
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'profiles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'companies' then
    v_company_id := coalesce(new.id, old.id);
  elsif TG_TABLE_NAME = 'roles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  else
    v_company_id := public.current_company_id();
  end if;

  if TG_TABLE_NAME = 'customers' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'email', new.email);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'email', old.email),
        'new', jsonb_build_object('name', new.name, 'email', new.email)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'email', old.email);
    end if;
  elsif TG_TABLE_NAME = 'bookings' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('service', new.service, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('service', old.service, 'status', old.status),
        'new', jsonb_build_object('service', new.service, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('service', old.service, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'invoices' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('amount', new.amount, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('amount', old.amount, 'status', old.status),
        'new', jsonb_build_object('amount', new.amount, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('amount', old.amount, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'companies' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'status', old.status),
        'new', jsonb_build_object('name', new.name, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('email', new.email, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('email', old.email, 'company_id', old.company_id),
        'new', jsonb_build_object('email', new.email, 'company_id', new.company_id)
      );
    else
      v_metadata := jsonb_build_object('email', old.email, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'roles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'description', old.description),
        'new', jsonb_build_object('name', new.name, 'description', new.description)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'permissions' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('code', old.code),
        'new', jsonb_build_object('code', new.code)
      );
    else
      v_metadata := jsonb_build_object('code', old.code);
    end if;
  elsif TG_TABLE_NAME = 'plans' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'code', old.code),
        'new', jsonb_build_object('name', new.name, 'code', new.code)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'code', old.code);
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.write_audit_log_junction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  if TG_TABLE_NAME = 'user_roles' then
    v_entity_id := coalesce(new.user_id, old.user_id)::text;
    v_metadata := jsonb_build_object(
      'user_id', coalesce(new.user_id, old.user_id),
      'role_id', coalesce(new.role_id, old.role_id)
    );
  elsif TG_TABLE_NAME = 'role_permissions' then
    v_entity_id := coalesce(new.role_id, old.role_id)::text;
    v_metadata := jsonb_build_object(
      'role_id', coalesce(new.role_id, old.role_id),
      'permission_id', coalesce(new.permission_id, old.permission_id)
    );
  elsif TG_TABLE_NAME = 'user_permissions' then
    v_entity_id := coalesce(new.user_id, old.user_id)::text;
    v_metadata := jsonb_build_object(
      'user_id', coalesce(new.user_id, old.user_id),
      'permission_id', coalesce(new.permission_id, old.permission_id)
    );
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    public.current_company_id(),
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
  on public.audit_logs for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
      )
    )
  );

drop policy if exists audit_logs_insert_policy on public.audit_logs;
create policy audit_logs_insert_policy
  on public.audit_logs for insert
  with check (false);

drop policy if exists audit_logs_update_policy on public.audit_logs;
create policy audit_logs_update_policy
  on public.audit_logs for update
  using (false)
  with check (false);

drop policy if exists audit_logs_delete_policy on public.audit_logs;
create policy audit_logs_delete_policy
  on public.audit_logs for delete
  using (false);

do $$
declare
  tbl text;
  id_tables text[] := array[
    'customers',
    'bookings',
    'invoices',
    'companies',
    'profiles',
    'roles',
    'permissions',
    'plans'
  ];
  junction_tables text[] := array[
    'user_roles',
    'role_permissions',
    'user_permissions'
  ];
begin
  foreach tbl in array id_tables loop
    execute format('drop trigger if exists trg_audit_%I on public.%I;', tbl, tbl);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute procedure public.write_audit_log();',
      tbl,
      tbl
    );
  end loop;

  foreach tbl in array junction_tables loop
    execute format('drop trigger if exists trg_audit_%I on public.%I;', tbl, tbl);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute procedure public.write_audit_log_junction();',
      tbl,
      tbl
    );
  end loop;
end $$;
