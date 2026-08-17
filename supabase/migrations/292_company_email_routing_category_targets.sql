-- Sprint 7 — AI Email Routing category → target configuration (company-scoped).

create table if not exists public.company_email_routing_category_targets (
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null
    check (category in (
      'sales',
      'support',
      'billing',
      'complaint',
      'hr',
      'general_inquiry'
    )),
  enabled boolean not null default true,
  target_type text not null
    check (target_type in ('department', 'employee', 'queue')),
  target_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, category)
);

comment on table public.company_email_routing_category_targets is
  'Per-company AI Email Routing category → department/employee/queue target map. Team is not supported.';

create index if not exists idx_company_email_routing_category_targets_company
  on public.company_email_routing_category_targets(company_id);

drop trigger if exists set_company_email_routing_category_targets_updated_at
  on public.company_email_routing_category_targets;
create trigger set_company_email_routing_category_targets_updated_at
  before update on public.company_email_routing_category_targets
  for each row
  execute procedure public.set_updated_at();

alter table public.company_email_routing_category_targets enable row level security;

drop policy if exists company_email_routing_category_targets_select
  on public.company_email_routing_category_targets;
create policy company_email_routing_category_targets_select
  on public.company_email_routing_category_targets for select
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('settings.view')
        or public.user_has_permission('settings.edit')
      )
    )
  );

drop policy if exists company_email_routing_category_targets_insert
  on public.company_email_routing_category_targets;
create policy company_email_routing_category_targets_insert
  on public.company_email_routing_category_targets for insert
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

drop policy if exists company_email_routing_category_targets_update
  on public.company_email_routing_category_targets;
create policy company_email_routing_category_targets_update
  on public.company_email_routing_category_targets for update
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

drop policy if exists company_email_routing_category_targets_delete
  on public.company_email_routing_category_targets;
create policy company_email_routing_category_targets_delete
  on public.company_email_routing_category_targets for delete
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

grant select, insert, update, delete on public.company_email_routing_category_targets to authenticated;
grant all on public.company_email_routing_category_targets to service_role;

-- Validate target_id belongs to the same company for the given target_type.
create or replace function public.validate_email_routing_target(
  p_company_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target_id is null then
    return;
  end if;

  if p_target_type = 'department' then
    if not exists (
      select 1
      from public.organization_departments d
      where d.id = p_target_id
        and d.company_id = p_company_id
    ) then
      raise exception 'Invalid department target for company';
    end if;
    return;
  end if;

  if p_target_type = 'employee' then
    if not exists (
      select 1
      from public.profiles p
      where p.id = p_target_id
        and p.company_id = p_company_id
    ) then
      raise exception 'Invalid employee target for company';
    end if;
    return;
  end if;

  if p_target_type = 'queue' then
    if not exists (
      select 1
      from public.handoff_queues q
      where q.id = p_target_id
        and q.company_id = p_company_id
        and q.deleted_at is null
    ) then
      raise exception 'Invalid queue target for company';
    end if;
    return;
  end if;

  raise exception 'Unsupported email routing target type';
end;
$$;

revoke all on function public.validate_email_routing_target(uuid, text, uuid) from public;
revoke all on function public.validate_email_routing_target(uuid, text, uuid) from anon;
revoke all on function public.validate_email_routing_target(uuid, text, uuid) from authenticated;
grant execute on function public.validate_email_routing_target(uuid, text, uuid) to service_role;

create or replace function public.get_my_company_email_routing_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_categories jsonb;
  v_departments jsonb;
  v_employees jsonb;
  v_queues jsonb;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Forbidden';
  end if;

  if not (
    public.user_has_permission('settings.view')
    or public.user_has_permission('settings.edit')
  ) then
    raise exception 'Forbidden';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category', c.category,
      'enabled', coalesce(t.enabled, true),
      'target_type', coalesce(t.target_type, 'department'),
      'target_id', t.target_id,
      'updated_at', t.updated_at
    )
    order by array_position(
      array['sales','support','billing','complaint','hr','general_inquiry'],
      c.category
    )
  ), '[]'::jsonb)
  into v_categories
  from (
    values
      ('sales'),
      ('support'),
      ('billing'),
      ('complaint'),
      ('hr'),
      ('general_inquiry')
  ) as c(category)
  left join public.company_email_routing_category_targets t
    on t.company_id = v_company_id
   and t.category = c.category;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', d.id, 'name', d.name)
    order by d.name
  ), '[]'::jsonb)
  into v_departments
  from public.organization_departments d
  where d.company_id = v_company_id
    and coalesce(d.is_active, true) = true;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email
    )
    order by coalesce(p.full_name, p.email)
  ), '[]'::jsonb)
  into v_employees
  from public.profiles p
  where p.company_id = v_company_id
    and coalesce(p.is_active, true) = true
    and coalesce(p.is_super_admin, false) = false;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', q.id, 'name', q.name)
    order by q.name
  ), '[]'::jsonb)
  into v_queues
  from public.handoff_queues q
  where q.company_id = v_company_id
    and q.deleted_at is null
    and coalesce(q.is_active, true) = true;

  return jsonb_build_object(
    'company_id', v_company_id,
    'can_edit', public.user_has_permission('settings.edit'),
    'categories', v_categories,
    'target_options', jsonb_build_object(
      'departments', v_departments,
      'employees', v_employees,
      'queues', v_queues
    )
  );
end;
$$;

create or replace function public.upsert_my_company_email_routing_config(p_categories jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_item jsonb;
  v_category text;
  v_enabled boolean;
  v_target_type text;
  v_target_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Forbidden';
  end if;

  if not public.user_has_permission('settings.edit') then
    raise exception 'Forbidden';
  end if;

  if p_categories is null or jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Invalid categories payload';
  end if;

  for v_item in select value from jsonb_array_elements(p_categories)
  loop
    v_category := lower(trim(coalesce(v_item->>'category', '')));
    if v_category not in ('sales', 'support', 'billing', 'complaint', 'hr', 'general_inquiry') then
      raise exception 'Invalid email routing category';
    end if;

    v_enabled := coalesce((v_item->>'enabled')::boolean, true);
    v_target_type := lower(trim(coalesce(v_item->>'target_type', 'department')));
    if v_target_type not in ('department', 'employee', 'queue') then
      raise exception 'Invalid email routing target type';
    end if;

    v_target_id := null;
    if coalesce(v_item->>'target_id', '') <> '' then
      begin
        v_target_id := (v_item->>'target_id')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'Invalid target_id';
      end;
    end if;

    perform public.validate_email_routing_target(v_company_id, v_target_type, v_target_id);

    insert into public.company_email_routing_category_targets (
      company_id,
      category,
      enabled,
      target_type,
      target_id,
      created_at,
      updated_at
    ) values (
      v_company_id,
      v_category,
      v_enabled,
      v_target_type,
      v_target_id,
      now(),
      now()
    )
    on conflict (company_id, category) do update set
      enabled = excluded.enabled,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      updated_at = now();
  end loop;

  return public.get_my_company_email_routing_config();
end;
$$;

revoke all on function public.get_my_company_email_routing_config() from public;
revoke all on function public.get_my_company_email_routing_config() from anon;
grant execute on function public.get_my_company_email_routing_config() to authenticated;

revoke all on function public.upsert_my_company_email_routing_config(jsonb) from public;
revoke all on function public.upsert_my_company_email_routing_config(jsonb) from anon;
grant execute on function public.upsert_my_company_email_routing_config(jsonb) to authenticated;
