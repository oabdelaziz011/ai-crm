-- 312 — Recalculate preserved_non_package_features AFTER custom overlay reset.
-- Does not change grant/limit/quota business logic.
-- Does not write a second audit event.

create or replace function public.change_company_package_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = internal, public
as $$
declare
  v_result jsonb;
  v_preserved text[] := '{}';
  v_skipped boolean := false;
begin
  v_result := internal.change_company_package_v1(p_company_id, p_plan_id, p_reason);
  perform public._reset_company_custom_commercial_overlay(p_company_id);

  select coalesce(array_agg(o.feature_code order by o.feature_code), '{}'::text[])
    into v_preserved
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.is_active = true
    and o.override_state = 'enabled'
    and o.source in ('manual', 'contract', 'system');

  v_result := coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object('preserved_non_package_features', to_jsonb(v_preserved));

  v_skipped := coalesce((v_result->>'skipped')::boolean, false);
  if not v_skipped then
    update public.billing_audit_logs
    set new_value = coalesce(new_value, '{}'::jsonb)
      || jsonb_build_object('preserved_non_package_features', to_jsonb(v_preserved))
    where id = (
      select l.id
      from public.billing_audit_logs l
      where l.company_id = p_company_id
        and l.event_type in ('package_upgraded', 'package_downgraded', 'package_changed')
      order by l.occurred_at desc
      limit 1
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.change_company_package_v1(uuid, uuid, text) from public, anon;
grant execute on function public.change_company_package_v1(uuid, uuid, text) to authenticated, service_role;

comment on function public.change_company_package_v1(uuid, uuid, text) is
  'Administrative catalog package change. Preserved-feature audit metadata is finalized after custom overlay reset. No payment.';
