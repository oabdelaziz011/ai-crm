-- ============================================================
-- Vault OS – Company default role provisioning
-- Requires 118_roles_tenant_unique_repair.sql (composite unique).
-- Idempotent: safe to re-run DDL and repair backfill.
-- ============================================================

create table if not exists public.platform_role_templates (
  template_key text primary key,
  name text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_role_template_permissions (
  template_key text not null references public.platform_role_templates (template_key) on delete cascade,
  permission_code text not null,
  primary key (template_key, permission_code)
);

insert into public.platform_role_templates (template_key, name, description, sort_order)
values
  ('admin', 'Admin', 'Company administrator with full workspace access', 1),
  ('manager', 'Manager', 'Operations and billing manager', 2),
  ('employee', 'Employee', 'Standard read-only employee access', 3)
on conflict (template_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

delete from public.platform_role_template_permissions
where template_key in ('admin', 'manager', 'employee');

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'users.view'),
    ('admin', 'users.edit'),
    ('admin', 'roles.view'),
    ('admin', 'roles.create'),
    ('admin', 'roles.edit'),
    ('admin', 'roles.delete'),
    ('admin', 'audit_logs.view'),
    ('admin', 'channels.view'),
    ('admin', 'channels.manage'),
    ('admin', 'settings.view'),
    ('admin', 'settings.edit'),
    ('admin', 'ai_assistant.view'),
    ('admin', 'ai_assistant.edit'),
    ('admin', 'knowledge.view'),
    ('admin', 'knowledge.manage'),
    ('admin', 'knowledge.import'),
    ('admin', 'ai.conversations.view'),
    ('admin', 'ai.conversations.reply'),
    ('admin', 'ai.conversations.takeover'),
    ('admin', 'ai.conversations.release'),
    ('admin', 'ai.analytics.view'),
    ('admin', 'ai.costs.view'),
    ('admin', 'ai_chat.view'),
    ('admin', 'ai_chat.use'),
    ('admin', 'customers.view'),
    ('admin', 'customers.create'),
    ('admin', 'customers.edit'),
    ('admin', 'customers.delete'),
    ('admin', 'bookings.view'),
    ('admin', 'bookings.create'),
    ('admin', 'bookings.edit'),
    ('admin', 'bookings.delete'),
    ('admin', 'invoices.view'),
    ('admin', 'invoices.create'),
    ('admin', 'invoices.edit'),
    ('admin', 'invoices.delete'),
    ('admin', 'reports.view'),
    ('admin', 'workspace.view'),
    ('admin', 'billing.view_own'),
    ('admin', 'billing.manage_own'),
    ('admin', 'billing.contact.edit_own'),
    ('admin', 'billing.payment_method.manage_own'),
    ('admin', 'billing.documents.download_own'),
    ('admin', 'subscriptions.view'),
    ('manager', 'workspace.view'),
    ('manager', 'billing.view_own'),
    ('manager', 'billing.manage_own'),
    ('manager', 'billing.contact.edit_own'),
    ('manager', 'billing.payment_method.manage_own'),
    ('manager', 'billing.documents.download_own'),
    ('manager', 'users.view'),
    ('manager', 'customers.view'),
    ('manager', 'customers.create'),
    ('manager', 'customers.edit'),
    ('manager', 'bookings.view'),
    ('manager', 'bookings.create'),
    ('manager', 'bookings.edit'),
    ('manager', 'invoices.view'),
    ('manager', 'reports.view'),
    ('manager', 'ai_chat.view'),
    ('manager', 'ai_chat.use'),
    ('employee', 'workspace.view'),
    ('employee', 'billing.view_own'),
    ('employee', 'billing.documents.download_own'),
    ('employee', 'customers.view'),
    ('employee', 'bookings.view'),
    ('employee', 'ai_chat.view')
) as v(template_key, permission_code)
where exists (
  select 1
  from public.permissions p
  where p.code = v.permission_code
)
on conflict (template_key, permission_code) do nothing;

create or replace function public.notify_role_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('vault.disable_role_notifications', true), 'off') = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.insert_notification(
      coalesce(new.company_id, public.current_company_id()),
      null,
      'notifications.events.roleCreated.title',
      public.notification_payload(
        'notifications.events.roleCreated.message',
        json_build_object('roleName', coalesce(new.name, ''))
      ),
      'success',
      'system'
    );
  elsif tg_op = 'UPDATE' and (
    coalesce(old.name, '') <> coalesce(new.name, '')
    or coalesce(old.description, '') <> coalesce(new.description, '')
  ) then
    perform public.insert_notification(
      coalesce(new.company_id, public.current_company_id()),
      null,
      'notifications.events.roleUpdated.title',
      public.notification_payload(
        'notifications.events.roleUpdated.message',
        json_build_object('roleName', coalesce(new.name, ''))
      ),
      'info',
      'system'
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.provision_company_default_roles(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_count integer;
  v_template record;
  v_role_id uuid;
  v_created integer := 0;
  v_role_ids uuid[] := '{}'::uuid[];
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'company % not found', p_company_id;
  end if;

  select count(*)::integer
  into v_existing_count
  from public.roles r
  where r.company_id = p_company_id;

  if v_existing_count > 0 then
    return jsonb_build_object(
      'company_id', p_company_id,
      'created', 0,
      'skipped', true,
      'reason', 'roles_already_exist'
    );
  end if;

  perform set_config('vault.disable_role_notifications', 'true', true);

  begin
    for v_template in
      select t.template_key, t.name, t.description
      from public.platform_role_templates t
      order by t.sort_order, t.name
    loop
      insert into public.roles (company_id, name, description, is_system)
      values (p_company_id, v_template.name, v_template.description, false)
      returning id into v_role_id;

      insert into public.role_permissions (role_id, permission_id)
      select v_role_id, p.id
      from public.platform_role_template_permissions tp
      inner join public.permissions p on p.code = tp.permission_code
      where tp.template_key = v_template.template_key
      on conflict do nothing;

      v_created := v_created + 1;
      v_role_ids := array_append(v_role_ids, v_role_id);
    end loop;
  exception
    when others then
      perform set_config('vault.disable_role_notifications', 'false', true);
      raise;
  end;

  perform set_config('vault.disable_role_notifications', 'false', true);

  if v_created = 0 then
    raise exception 'failed to provision default roles for company %', p_company_id;
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'created', v_created,
    'role_ids', to_jsonb(v_role_ids)
  );
end;
$$;

create or replace function public.trg_companies_provision_default_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_company_default_roles(new.id);
  return new;
end;
$$;

drop trigger if exists companies_provision_default_roles on public.companies;
create trigger companies_provision_default_roles
after insert on public.companies
for each row
execute function public.trg_companies_provision_default_roles();

create or replace function public.repair_companies_missing_roles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_repaired integer := 0;
begin
  create temp table if not exists _companies_missing_roles (
    id uuid primary key,
    name text not null
  ) on commit drop;

  truncate _companies_missing_roles;

  insert into _companies_missing_roles (id, name)
  select c.id, c.name
  from public.companies c
  where not exists (
    select 1
    from public.roles r
    where r.company_id = c.id
  )
  order by c.created_at;

  for v_company in
    select q.id, q.name
    from _companies_missing_roles q
  loop
    v_result := public.provision_company_default_roles(v_company.id);
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'company_id', v_company.id,
        'company_name', v_company.name,
        'result', v_result
      )
    );
    v_repaired := v_repaired + 1;
  end loop;

  return jsonb_build_object(
    'repaired', v_repaired,
    'companies', v_results
  );
end;
$$;

create or replace function public.create_company_v1(
  p_name text,
  p_status text default 'Trial',
  p_subscription_plan text default 'Basic',
  p_subscription_expires_at timestamptz default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_roles jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.companies (
    name,
    status,
    subscription_plan,
    subscription_expires_at,
    logo_url
  )
  values (
    p_name,
    coalesce(p_status, 'Trial'),
    coalesce(p_subscription_plan, 'Basic'),
    p_subscription_expires_at,
    p_logo_url
  )
  returning * into v_company;

  v_roles := public.provision_company_default_roles(v_company.id);

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'roles', v_roles
  );
end;
$$;

grant execute on function public.provision_company_default_roles(uuid) to authenticated;
grant execute on function public.repair_companies_missing_roles() to authenticated;
grant execute on function public.create_company_v1(text, text, text, timestamptz, text) to authenticated;

select public.repair_companies_missing_roles();

-- Reassign cross-tenant role links to the user's company Admin (idempotent).
update public.user_roles ur
set role_id = tenant_admin.id
from public.profiles p,
     public.roles tenant_admin,
     public.roles assigned_role
where ur.user_id = p.id
  and tenant_admin.company_id = p.company_id
  and tenant_admin.name = 'Admin'
  and assigned_role.id = ur.role_id
  and p.company_id is not null
  and assigned_role.company_id is distinct from p.company_id
  and tenant_admin.id is distinct from ur.role_id;
