-- ============================================================
-- 324 — Backfill one-time «رحلة كاملة» deep clones for existing
--       entitled product companies that missed migration 322 hooks.
--
-- Reuses public.provision_rahla_kamila_workflow_v1 (idempotent).
-- Does NOT redesign into a live template system.
-- Does NOT clone platform/demo companies.
-- Does NOT clone companies without workflow_automation.
-- Future entitlement/approval hooks remain unchanged (322).
-- ============================================================

create or replace function public.backfill_rahla_kamila_workflows_v1(
  p_company_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
begin
  -- Single-company mode (safe targeted backfill / E2E).
  if p_company_id is not null then
    v_result := public.provision_rahla_kamila_workflow_v1(p_company_id);
    return jsonb_build_object(
      'mode', 'single',
      'company_id', p_company_id,
      'result', v_result
    );
  end if;

  -- Product tenants only: effectively entitled, non-platform/non-demo.
  for r in
    select c.id, c.name
    from public.companies c
    where c.company_type = 'tenant'
      and public.is_feature_enabled(c.id, 'workflow_automation') = true
      -- Skip obvious disposable naming patterns from automated tests.
      and c.name !~* '^(RahlaClone|Review (Pkg|RBAC)|Scroll|RBAC|Lead Tog)'
      and coalesce(c.contact_email, '') !~* '@valueor\.test$'
    order by c.created_at
  loop
    begin
      v_result := public.provision_rahla_kamila_workflow_v1(r.id);
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'company_id', r.id,
          'company_name', r.name,
          'result', v_result
        )
      );

      if coalesce(v_result->>'status', '') = 'provisioned' then
        v_created := v_created + 1;
      elsif coalesce(v_result->>'status', '') = 'already_provisioned' then
        v_already := v_already + 1;
      elsif coalesce(v_result->>'status', '') like 'skipped_%' then
        v_skipped := v_skipped + 1;
      else
        v_errors := v_errors + 1;
      end if;
    exception
      when others then
        v_errors := v_errors + 1;
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'company_id', r.id,
            'company_name', r.name,
            'result', jsonb_build_object(
              'status', 'error',
              'reason', SQLERRM
            )
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'mode', 'product_tenants',
    'created', v_created,
    'already_provisioned', v_already,
    'skipped', v_skipped,
    'errors', v_errors,
    'results', v_results
  );
end;
$$;

comment on function public.backfill_rahla_kamila_workflows_v1(uuid) is
  'Idempotent backfill of one-time رحلة كاملة deep clones for entitled product tenants. Reuses provision_rahla_kamila_workflow_v1. No live template sync.';

revoke all on function public.backfill_rahla_kamila_workflows_v1(uuid) from public, anon;
grant execute on function public.backfill_rahla_kamila_workflows_v1(uuid) to service_role;
-- authenticated may run single-company only via service in ops scripts; keep broad execute off for safety
-- (service_role only). Ops scripts use DATABASE_URL / service.
