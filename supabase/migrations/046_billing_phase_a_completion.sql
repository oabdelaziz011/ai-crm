-- ============================================================
-- Vault OS – Billing Phase A completion
-- Export permission enforcement, settings validation_schema exposure
-- ============================================================

-- ── Settings RPC: expose validation_schema ───────────────────
-- PostgreSQL cannot change RETURNS TABLE columns via CREATE OR REPLACE;
-- drop the prior (text, text, uuid) signature before recreating it.

drop function if exists public.get_billing_settings_by_category(text, text, uuid);

create or replace function public.get_billing_settings_by_category(
  p_category text,
  p_scope_type text default 'platform',
  p_company_id uuid default null
)
returns table (
  code text,
  category text,
  label text,
  description text,
  value_type text,
  scope_type text,
  value jsonb,
  default_value jsonb,
  version integer,
  validation_schema jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_view_billing_settings(p_scope_type, p_company_id) then
    raise exception 'Insufficient permissions to read billing settings';
  end if;

  return query
  select
    d.code,
    d.category,
    d.label,
    d.description,
    d.value_type,
    p_scope_type,
    coalesce(
      s.value,
      case when p_scope_type = 'platform' then ps.value else cs.value end,
      d.default_value
    ),
    d.default_value,
    coalesce(
      s.version,
      case when p_scope_type = 'platform' then ps.version else cs.version end,
      0
    ),
    d.validation_schema
  from public.billing_setting_definitions d
  left join public.billing_settings s
    on s.definition_code = d.code
   and s.scope_type = p_scope_type
   and (
     (p_scope_type = 'platform' and s.scope_id is null)
     or (p_scope_type = 'company' and s.scope_id = p_company_id)
   )
  left join public.billing_settings ps
    on ps.definition_code = d.code
   and ps.scope_type = 'platform'
   and ps.scope_id is null
  left join public.billing_settings cs
    on cs.definition_code = d.code
   and cs.scope_type = 'company'
   and cs.scope_id = p_company_id
  where d.category = p_category
    and d.is_active = true
    and (d.scope_type = p_scope_type or d.scope_type = 'both')
  order by d.sort_order, d.code;
end;
$$;

-- ── Audit list/export: enforce billing.audit.export for export mode ─

create or replace function public.list_billing_audit_logs_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_event_type text default null,
  p_for_export boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_manual bigint;
  v_system bigint;
  v_api bigint;
  v_rows jsonb;
  v_stats jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;

  if coalesce(p_for_export, false) then
    if not public.can_export_billing_audit() then
      raise exception 'Insufficient permissions to export billing audit log';
    end if;
  elsif not public.can_view_billing_audit(null) and not public.is_platform_billing_operator() then
    raise exception 'Insufficient permissions to view billing audit log';
  end if;

  select
    count(*),
    count(*) filter (where bal.source = 'manual'),
    count(*) filter (where bal.source = 'system'),
    count(*) filter (where bal.source = 'api')
  into v_total, v_manual, v_system, v_api
  from public.billing_audit_logs bal
  left join public.companies c on c.id = bal.company_id
  where (
    public.is_super_admin()
    or public.user_has_permission('billing.audit.view')
    or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
    or (coalesce(p_for_export, false) and public.can_export_billing_audit())
  )
  and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
  and (
    p_search is null or trim(p_search) = ''
    or bal.event_type ilike '%' || trim(p_search) || '%'
    or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
    or bal.source ilike '%' || trim(p_search) || '%'
  );

  v_stats := jsonb_build_object(
    'total', v_total,
    'manual', v_manual,
    'system', v_system,
    'api', v_api
  );

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bal.*, jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url) as company
    from public.billing_audit_logs bal
    left join public.companies c on c.id = bal.company_id
    where (
      public.is_super_admin()
      or public.user_has_permission('billing.audit.view')
      or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
      or (coalesce(p_for_export, false) and public.can_export_billing_audit())
    )
    and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
    and (
      p_search is null or trim(p_search) = ''
      or bal.event_type ilike '%' || trim(p_search) || '%'
      or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
      or bal.source ilike '%' || trim(p_search) || '%'
    )
    order by bal.occurred_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows,
    'stats', v_stats
  );
end;
$$;

revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text) from public;
revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text) from authenticated;

revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text, boolean) from public;
grant execute on function public.list_billing_audit_logs_paged(integer, integer, text, text, boolean) to authenticated;

revoke all on function public.get_billing_settings_by_category(text, text, uuid) from public;
grant execute on function public.get_billing_settings_by_category(text, text, uuid) to authenticated;
