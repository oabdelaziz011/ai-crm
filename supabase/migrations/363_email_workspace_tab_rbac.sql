-- =============================================================================
-- 363 — Email Workspace tab RBAC (Templates / AI Routing / Settings)
-- =============================================================================
-- Adds two catalog permissions and reuses ai.email.manage for Email Settings.
-- Does NOT grant any of these codes to existing roles (including Admin).
-- Does NOT modify Super Admin (is_super_admin() bypass in user_has_permission).
-- Does NOT change Incoming / Sent / Pending conversation visibility.
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  (
    'email.templates.view',
    'Email Automation',
    'Email Automation',
    'View',
    'Open the Email Workspace Templates tab and manage company email templates'
  ),
  (
    'email.routing.view',
    'Email Automation',
    'Email Automation',
    'View',
    'Open the Email Workspace AI Routing tab and configure inbound email routing'
  )
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

update public.permissions
set
  description = 'Open the Email Workspace Settings tab and configure mailbox connection, identity, signature, and acknowledgement',
  updated_at = now()
where code = 'ai.email.manage';

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('email_channel', 'email.templates.view'),
  ('ai_email_routing', 'email.routing.view')
on conflict (feature_code, permission_code) do nothing;

-- ── Templates RLS: dedicated tab permission (read + write) ───────────────────

drop policy if exists company_email_templates_select on public.company_email_templates;
create policy company_email_templates_select
  on public.company_email_templates for select
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.templates.view')
    )
  );

drop policy if exists company_email_templates_insert on public.company_email_templates;
create policy company_email_templates_insert
  on public.company_email_templates for insert
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.templates.view')
    )
  );

drop policy if exists company_email_templates_update on public.company_email_templates;
create policy company_email_templates_update
  on public.company_email_templates for update
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.templates.view')
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.templates.view')
    )
  );

drop policy if exists company_email_templates_delete on public.company_email_templates;
create policy company_email_templates_delete
  on public.company_email_templates for delete
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.templates.view')
    )
  );

-- ── Routing RLS: dedicated tab permission (read + write) ─────────────────────

drop policy if exists company_email_routing_category_targets_select
  on public.company_email_routing_category_targets;
create policy company_email_routing_category_targets_select
  on public.company_email_routing_category_targets for select
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.routing.view')
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
      and public.user_has_permission('email.routing.view')
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
      and public.user_has_permission('email.routing.view')
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('email.routing.view')
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
      and public.user_has_permission('email.routing.view')
    )
  );

-- ── Routing RPCs ─────────────────────────────────────────────────────────────

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

  if not public.user_has_permission('email.routing.view') then
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
    'can_edit', public.user_has_permission('email.routing.view'),
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

  if not public.user_has_permission('email.routing.view') then
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

-- ── Email Settings public RPC wrappers (do not rewrite internal bodies) ──────

create or replace function public.get_company_email_settings(p_company_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to public, internal
as $$
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    if p_company_id is distinct from public.current_company_id()
       or not public.user_has_permission('ai.email.manage') then
      raise exception 'Forbidden';
    end if;
  end if;
  return internal.get_company_email_settings(p_company_id);
end;
$$;

create or replace function public.upsert_company_email_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_encryption text,
  p_from_email text,
  p_from_name text,
  p_max_retry_count integer default 3,
  p_conversation_enabled boolean default false,
  p_inbound_provider text default 'imap'::text,
  p_outbound_provider text default 'smtp'::text,
  p_imap_host text default ''::text,
  p_imap_port integer default 993,
  p_imap_username text default ''::text,
  p_imap_password text default ''::text,
  p_imap_encryption text default 'ssl'::text,
  p_reply_to_email text default ''::text,
  p_max_attachment_bytes bigint default 26214400,
  p_imap_mailbox text default 'INBOX'::text,
  p_imap_poll_interval_seconds integer default 60,
  p_oauth_provider text default null::text,
  p_oauth_token text default ''::text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to public, internal
as $$
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    if p_company_id is distinct from public.current_company_id()
       or not public.user_has_permission('ai.email.manage') then
      raise exception 'Forbidden';
    end if;
  end if;
  return internal.upsert_company_email_settings(
    p_company_id,
    p_enabled,
    p_smtp_host,
    p_smtp_port,
    p_smtp_username,
    p_smtp_password,
    p_smtp_encryption,
    p_from_email,
    p_from_name,
    p_max_retry_count,
    p_conversation_enabled,
    p_inbound_provider,
    p_outbound_provider,
    p_imap_host,
    p_imap_port,
    p_imap_username,
    p_imap_password,
    p_imap_encryption,
    p_reply_to_email,
    p_max_attachment_bytes,
    p_imap_mailbox,
    p_imap_poll_interval_seconds,
    p_oauth_provider,
    p_oauth_token
  );
end;
$$;

revoke all on function public.get_company_email_settings(uuid) from public;
revoke all on function public.get_company_email_settings(uuid) from anon;
grant execute on function public.get_company_email_settings(uuid) to authenticated, service_role;

revoke all on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) from public;
revoke all on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) from anon;
grant execute on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) to authenticated, service_role;

-- ── Email Settings table RLS: ai.email.manage instead of company admin ───────

drop policy if exists company_email_settings_select on public.company_email_settings;
create policy company_email_settings_select
  on public.company_email_settings for select
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('ai.email.manage')
          and internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
        )
      )
    )
  );

drop policy if exists company_email_settings_upsert on public.company_email_settings;
create policy company_email_settings_upsert
  on public.company_email_settings for all
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('ai.email.manage')
          and (
            internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
            or enabled = false
          )
        )
      )
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('ai.email.manage')
          and (
            internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
            or enabled = false
          )
        )
      )
    )
  );

-- ── Invariants: catalog exists, no silent role grants for the two new codes ──

do $$
declare
  v_missing integer;
begin
  select count(*)::int into v_missing
  from (
    values ('email.templates.view'), ('email.routing.view'), ('ai.email.manage')
  ) as required(code)
  where not exists (select 1 from public.permissions p where p.code = required.code);

  if v_missing <> 0 then
    raise exception '363 fail-closed: missing Email tab permission catalog rows';
  end if;
end $$;
