-- 345 — Platform AI kill-switch fail-closed (B1.2 Part 5 Fix-A)
-- Missing platform_ai_feature_flags row → deny (was allow via coalesce(..., true)).
-- Does not alter commercial entitlement semantics or super-admin bypass.

create or replace function internal.platform_ai_feature_enabled(
  p_company_id uuid,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select
    public.is_super_admin()
    or coalesce(
      (
        select ff.is_enabled
        from public.platform_ai_feature_flags ff
        where ff.company_id = p_company_id
          and ff.feature_key = p_feature_key
        limit 1
      ),
      false
    );
$$;

comment on function internal.platform_ai_feature_enabled(uuid, text) is
  'Platform AI runtime kill-switch. Explicit row required; missing row denies. Super-admin bypass preserved. Not commercial licensing.';
