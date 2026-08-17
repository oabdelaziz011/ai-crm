-- ============================================================
-- 289 — Zero Security Advisor DEFINER exposure (schema boundary)
--
-- Supabase lint 0028/0029 only flags SECURITY DEFINER functions in
-- PostgREST-exposed schemas (default: public).
--
-- Strategy (per Supabase remediation):
--   1) Move DEFINER implementations to schema internal (not exposed).
--   2) Recreate same-named public SECURITY INVOKER wrappers that
--      forward to internal.* — browser/PostgREST RPC paths unchanged.
--   3) Set internal search_path so sibling calls resolve to internal first.
--
-- Does NOT re-expose platform_resolve_ai_runtime_config to auth/anon.
-- Does NOT change RLS policies or business logic bodies.
-- ============================================================

create schema if not exists internal;

revoke all on schema internal from public;
grant usage on schema internal to postgres;
grant usage on schema internal to service_role;
grant usage on schema internal to authenticated;
grant usage on schema internal to anon;

-- --- appointment_platform_company_metrics_v1(p_company_id uuid, p_period_start timestamp with time zone) ---
alter function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) set schema internal;
alter function internal."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) set search_path to internal, public;
create or replace function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone DEFAULT date_trunc('month'::text, now()))
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."appointment_platform_company_metrics_v1"(p_company_id, p_period_start); $w$;
revoke all on function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) from public;
revoke all on function internal."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) from public;
grant execute on function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) to service_role;
grant execute on function internal."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) to service_role;
grant execute on function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) to authenticated;
grant execute on function internal."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) to authenticated;
comment on function public."appointment_platform_company_metrics_v1"(p_company_id uuid, p_period_start timestamp with time zone) is 'Aggregated appointment metrics for dashboard ΓÇö Sprint 6.12.';

-- --- approve_company_v1(p_company_id uuid, p_mode text, p_notes text) ---
alter function public."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) set schema internal;
alter function internal."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) set search_path to internal, public;
create or replace function public."approve_company_v1"(p_company_id uuid, p_mode text DEFAULT 'trial'::text, p_notes text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."approve_company_v1"(p_company_id, p_mode, p_notes); $w$;
revoke all on function public."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) from public;
revoke all on function internal."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) from public;
grant execute on function public."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) to service_role;
grant execute on function internal."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) to service_role;
grant execute on function public."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) to authenticated;
grant execute on function internal."approve_company_v1"(p_company_id uuid, p_mode text, p_notes text) to authenticated;

-- --- assign_company_package_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) ---
alter function public."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) set schema internal;
alter function internal."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) set search_path to internal, public;
create or replace function public."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."assign_company_package_v1"(p_company_id, p_plan_id, p_billing_cycle); $w$;
revoke all on function public."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from public;
revoke all on function internal."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from public;
grant execute on function public."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to service_role;
grant execute on function internal."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to service_role;
grant execute on function public."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to authenticated;
grant execute on function internal."assign_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to authenticated;

-- --- assign_subscription_plan(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) ---
alter function public."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) set schema internal;
alter function internal."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) set search_path to internal, public;
create or replace function public."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."assign_subscription_plan"(p_company_id, p_plan_id, p_billing_cycle); $w$;
revoke all on function public."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from public;
revoke all on function internal."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from public;
grant execute on function public."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to service_role;
grant execute on function internal."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to service_role;
grant execute on function public."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to authenticated;
grant execute on function internal."assign_subscription_plan"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) to authenticated;

-- --- can_view_billing_audit(p_company_id uuid) ---
alter function public."can_view_billing_audit"(p_company_id uuid) set schema internal;
alter function internal."can_view_billing_audit"(p_company_id uuid) set search_path to internal, public;
create or replace function public."can_view_billing_audit"(p_company_id uuid DEFAULT NULL::uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."can_view_billing_audit"(p_company_id); $w$;
revoke all on function public."can_view_billing_audit"(p_company_id uuid) from public;
revoke all on function internal."can_view_billing_audit"(p_company_id uuid) from public;
grant execute on function public."can_view_billing_audit"(p_company_id uuid) to service_role;
grant execute on function internal."can_view_billing_audit"(p_company_id uuid) to service_role;
grant execute on function public."can_view_billing_audit"(p_company_id uuid) to authenticated;
grant execute on function internal."can_view_billing_audit"(p_company_id uuid) to authenticated;

-- --- can_view_billing_company(p_company_id uuid) ---
alter function public."can_view_billing_company"(p_company_id uuid) set schema internal;
alter function internal."can_view_billing_company"(p_company_id uuid) set search_path to internal, public;
create or replace function public."can_view_billing_company"(p_company_id uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."can_view_billing_company"(p_company_id); $w$;
revoke all on function public."can_view_billing_company"(p_company_id uuid) from public;
revoke all on function internal."can_view_billing_company"(p_company_id uuid) from public;
grant execute on function public."can_view_billing_company"(p_company_id uuid) to service_role;
grant execute on function internal."can_view_billing_company"(p_company_id uuid) to service_role;
grant execute on function public."can_view_billing_company"(p_company_id uuid) to authenticated;
grant execute on function internal."can_view_billing_company"(p_company_id uuid) to authenticated;

-- --- can_view_billing_settings(p_scope_type text, p_company_id uuid) ---
alter function public."can_view_billing_settings"(p_scope_type text, p_company_id uuid) set schema internal;
alter function internal."can_view_billing_settings"(p_scope_type text, p_company_id uuid) set search_path to internal, public;
create or replace function public."can_view_billing_settings"(p_scope_type text, p_company_id uuid DEFAULT NULL::uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."can_view_billing_settings"(p_scope_type, p_company_id); $w$;
revoke all on function public."can_view_billing_settings"(p_scope_type text, p_company_id uuid) from public;
revoke all on function internal."can_view_billing_settings"(p_scope_type text, p_company_id uuid) from public;
grant execute on function public."can_view_billing_settings"(p_scope_type text, p_company_id uuid) to service_role;
grant execute on function internal."can_view_billing_settings"(p_scope_type text, p_company_id uuid) to service_role;
grant execute on function public."can_view_billing_settings"(p_scope_type text, p_company_id uuid) to authenticated;
grant execute on function internal."can_view_billing_settings"(p_scope_type text, p_company_id uuid) to authenticated;

-- --- cancel_company_subscription_v1(p_company_id uuid, p_reason text, p_at_period_end boolean) ---
alter function public."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) set schema internal;
alter function internal."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) set search_path to internal, public;
create or replace function public."cancel_company_subscription_v1"(p_company_id uuid, p_reason text DEFAULT NULL::text, p_at_period_end boolean DEFAULT false)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."cancel_company_subscription_v1"(p_company_id, p_reason, p_at_period_end); $w$;
revoke all on function public."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) from public;
revoke all on function internal."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) from public;
grant execute on function public."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) to service_role;
grant execute on function internal."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) to service_role;
grant execute on function public."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) to authenticated;
grant execute on function internal."cancel_company_subscription_v1"(p_company_id uuid, p_reason text, p_at_period_end boolean) to authenticated;

-- --- change_company_package_v1(p_company_id uuid, p_plan_id uuid, p_reason text) ---
alter function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) set schema internal;
alter function internal."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."change_company_package_v1"(p_company_id, p_plan_id, p_reason); $w$;
revoke all on function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) from public;
revoke all on function internal."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) from public;
grant execute on function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) to service_role;
grant execute on function internal."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) to service_role;
grant execute on function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) to authenticated;
grant execute on function internal."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) to authenticated;
comment on function public."change_company_package_v1"(p_company_id uuid, p_plan_id uuid, p_reason text) is 'Phase 7.7: administrative package upgrade/downgrade with package-grant sync. Preserves lifecycle dates/cycle/status. No payment.';

-- --- company_has_agents_access(p_company_id uuid, p_permission text) ---
alter function public."company_has_agents_access"(p_company_id uuid, p_permission text) set schema internal;
alter function internal."company_has_agents_access"(p_company_id uuid, p_permission text) set search_path to internal, public;
create or replace function public."company_has_agents_access"(p_company_id uuid, p_permission text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."company_has_agents_access"(p_company_id, p_permission); $w$;
revoke all on function public."company_has_agents_access"(p_company_id uuid, p_permission text) from public;
revoke all on function internal."company_has_agents_access"(p_company_id uuid, p_permission text) from public;
grant execute on function public."company_has_agents_access"(p_company_id uuid, p_permission text) to service_role;
grant execute on function internal."company_has_agents_access"(p_company_id uuid, p_permission text) to service_role;
grant execute on function public."company_has_agents_access"(p_company_id uuid, p_permission text) to authenticated;
grant execute on function internal."company_has_agents_access"(p_company_id uuid, p_permission text) to authenticated;
comment on function public."company_has_agents_access"(p_company_id uuid, p_permission text) is 'Agents RLS gate: requires RBAC permission and ai_agents feature enabled. Super-admin bypass via company_has_permission and platform_ai_feature_enabled (Sprint 6.2.4).';

-- --- company_has_permission(p_company_id uuid, p_permission text) ---
alter function public."company_has_permission"(p_company_id uuid, p_permission text) set schema internal;
alter function internal."company_has_permission"(p_company_id uuid, p_permission text) set search_path to internal, public;
create or replace function public."company_has_permission"(p_company_id uuid, p_permission text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."company_has_permission"(p_company_id, p_permission); $w$;
revoke all on function public."company_has_permission"(p_company_id uuid, p_permission text) from public;
revoke all on function internal."company_has_permission"(p_company_id uuid, p_permission text) from public;
grant execute on function public."company_has_permission"(p_company_id uuid, p_permission text) to service_role;
grant execute on function internal."company_has_permission"(p_company_id uuid, p_permission text) to service_role;
grant execute on function public."company_has_permission"(p_company_id uuid, p_permission text) to authenticated;
grant execute on function internal."company_has_permission"(p_company_id uuid, p_permission text) to authenticated;

-- --- conversation_belongs_to_current_company(p_conversation_id uuid) ---
alter function public."conversation_belongs_to_current_company"(p_conversation_id uuid) set schema internal;
alter function internal."conversation_belongs_to_current_company"(p_conversation_id uuid) set search_path to internal, public;
create or replace function public."conversation_belongs_to_current_company"(p_conversation_id uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."conversation_belongs_to_current_company"(p_conversation_id); $w$;
revoke all on function public."conversation_belongs_to_current_company"(p_conversation_id uuid) from public;
revoke all on function internal."conversation_belongs_to_current_company"(p_conversation_id uuid) from public;
grant execute on function public."conversation_belongs_to_current_company"(p_conversation_id uuid) to service_role;
grant execute on function internal."conversation_belongs_to_current_company"(p_conversation_id uuid) to service_role;
grant execute on function public."conversation_belongs_to_current_company"(p_conversation_id uuid) to authenticated;
grant execute on function internal."conversation_belongs_to_current_company"(p_conversation_id uuid) to authenticated;

-- --- convert_trial_to_paid_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) ---
alter function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) set schema internal;
alter function internal."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) set search_path to internal, public;
create or replace function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text DEFAULT NULL::text, p_conversion_source text DEFAULT 'admin'::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."convert_trial_to_paid_v1"(p_company_id, p_plan_id, p_billing_cycle, p_reason, p_conversion_source); $w$;
revoke all on function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) from public;
revoke all on function internal."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) from public;
grant execute on function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) to service_role;
grant execute on function internal."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) to service_role;
grant execute on function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) to authenticated;
grant execute on function internal."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) to authenticated;
comment on function public."convert_trial_to_paid_v1"(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) is 'Phase 7.6 administrative trialΓåÆpaid conversion. Expires trial grants, assigns package, activates subscription. Does not collect payment.';

-- --- create_company_admin_v1(p_payload jsonb) ---
alter function public."create_company_admin_v1"(p_payload jsonb) set schema internal;
alter function internal."create_company_admin_v1"(p_payload jsonb) set search_path to internal, public;
create or replace function public."create_company_admin_v1"(p_payload jsonb)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."create_company_admin_v1"(p_payload); $w$;
revoke all on function public."create_company_admin_v1"(p_payload jsonb) from public;
revoke all on function internal."create_company_admin_v1"(p_payload jsonb) from public;
grant execute on function public."create_company_admin_v1"(p_payload jsonb) to service_role;
grant execute on function internal."create_company_admin_v1"(p_payload jsonb) to service_role;
grant execute on function public."create_company_admin_v1"(p_payload jsonb) to authenticated;
grant execute on function internal."create_company_admin_v1"(p_payload jsonb) to authenticated;
comment on function public."create_company_admin_v1"(p_payload jsonb) is 'Authorized platform/admin company create with onboarding identity fields. Requires is_super_admin or companies.create. Does not invite owners.';

-- --- create_company_v1(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) ---
alter function public."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) set schema internal;
alter function internal."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) set search_path to internal, public;
create or replace function public."create_company_v1"(p_name text, p_status text DEFAULT 'Trial'::text, p_subscription_plan text DEFAULT 'Basic'::text, p_subscription_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_logo_url text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."create_company_v1"(p_name, p_status, p_subscription_plan, p_subscription_expires_at, p_logo_url); $w$;
revoke all on function public."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) from public;
revoke all on function internal."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) from public;
grant execute on function public."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) to service_role;
grant execute on function internal."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) to service_role;
grant execute on function public."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) to authenticated;
grant execute on function internal."create_company_v1"(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) to authenticated;

-- --- crm_same_company(p_owner_user_id uuid) ---
alter function public."crm_same_company"(p_owner_user_id uuid) set schema internal;
alter function internal."crm_same_company"(p_owner_user_id uuid) set search_path to internal, public;
create or replace function public."crm_same_company"(p_owner_user_id uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."crm_same_company"(p_owner_user_id); $w$;
revoke all on function public."crm_same_company"(p_owner_user_id uuid) from public;
revoke all on function internal."crm_same_company"(p_owner_user_id uuid) from public;
grant execute on function public."crm_same_company"(p_owner_user_id uuid) to service_role;
grant execute on function internal."crm_same_company"(p_owner_user_id uuid) to service_role;
grant execute on function public."crm_same_company"(p_owner_user_id uuid) to authenticated;
grant execute on function internal."crm_same_company"(p_owner_user_id uuid) to authenticated;

-- --- current_company_id() ---
alter function public."current_company_id"() set schema internal;
alter function internal."current_company_id"() set search_path to internal, public;
create or replace function public."current_company_id"()
 returns uuid
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."current_company_id"(); $w$;
revoke all on function public."current_company_id"() from public;
revoke all on function internal."current_company_id"() from public;
grant execute on function public."current_company_id"() to service_role;
grant execute on function internal."current_company_id"() to service_role;
grant execute on function public."current_company_id"() to authenticated;
grant execute on function internal."current_company_id"() to authenticated;

-- --- executive_record_access(p_company_id uuid, p_section text, p_metadata jsonb) ---
alter function public."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) set schema internal;
alter function internal."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) set search_path to internal, public;
create or replace function public."executive_record_access"(p_company_id uuid, p_section text DEFAULT 'dashboard'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 returns uuid
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."executive_record_access"(p_company_id, p_section, p_metadata); $w$;
revoke all on function public."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) from public;
revoke all on function internal."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) from public;
grant execute on function public."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) to service_role;
grant execute on function internal."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) to service_role;
grant execute on function public."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) to authenticated;
grant execute on function internal."executive_record_access"(p_company_id uuid, p_section text, p_metadata jsonb) to authenticated;

-- --- extend_company_trial_v1(p_company_id uuid, p_new_ends_at timestamp with time zone) ---
alter function public."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) set schema internal;
alter function internal."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) set search_path to internal, public;
create or replace function public."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."extend_company_trial_v1"(p_company_id, p_new_ends_at); $w$;
revoke all on function public."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) from public;
revoke all on function internal."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) from public;
grant execute on function public."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) to service_role;
grant execute on function internal."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) to service_role;
grant execute on function public."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) to authenticated;
grant execute on function internal."extend_company_trial_v1"(p_company_id uuid, p_new_ends_at timestamp with time zone) to authenticated;

-- --- financial_append_ledger(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) ---
alter function public."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) set schema internal;
alter function internal."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) set search_path to internal, public;
create or replace function public."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb DEFAULT '{}'::jsonb, p_created_by uuid DEFAULT NULL::uuid)
 returns uuid
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."financial_append_ledger"(p_company_id, p_entry_type, p_direction, p_amount_cents, p_currency, p_reference_type, p_reference_id, p_description, p_metadata, p_created_by); $w$;
revoke all on function public."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) from public;
revoke all on function internal."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) from public;
grant execute on function public."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) to service_role;
grant execute on function internal."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) to service_role;
grant execute on function public."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) to authenticated;
grant execute on function internal."financial_append_ledger"(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) to authenticated;

-- --- financial_next_invoice_number(p_company_id uuid) ---
alter function public."financial_next_invoice_number"(p_company_id uuid) set schema internal;
alter function internal."financial_next_invoice_number"(p_company_id uuid) set search_path to internal, public;
create or replace function public."financial_next_invoice_number"(p_company_id uuid)
 returns text
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."financial_next_invoice_number"(p_company_id); $w$;
revoke all on function public."financial_next_invoice_number"(p_company_id uuid) from public;
revoke all on function internal."financial_next_invoice_number"(p_company_id uuid) from public;
grant execute on function public."financial_next_invoice_number"(p_company_id uuid) to service_role;
grant execute on function internal."financial_next_invoice_number"(p_company_id uuid) to service_role;
grant execute on function public."financial_next_invoice_number"(p_company_id uuid) to authenticated;
grant execute on function internal."financial_next_invoice_number"(p_company_id uuid) to authenticated;

-- --- generate_support_ticket_number(p_company_id uuid) ---
alter function public."generate_support_ticket_number"(p_company_id uuid) set schema internal;
alter function internal."generate_support_ticket_number"(p_company_id uuid) set search_path to internal, public;
create or replace function public."generate_support_ticket_number"(p_company_id uuid)
 returns text
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."generate_support_ticket_number"(p_company_id); $w$;
revoke all on function public."generate_support_ticket_number"(p_company_id uuid) from public;
revoke all on function internal."generate_support_ticket_number"(p_company_id uuid) from public;
grant execute on function public."generate_support_ticket_number"(p_company_id uuid) to service_role;
grant execute on function internal."generate_support_ticket_number"(p_company_id uuid) to service_role;
grant execute on function public."generate_support_ticket_number"(p_company_id uuid) to authenticated;
grant execute on function internal."generate_support_ticket_number"(p_company_id uuid) to authenticated;

-- --- get_assignable_roles(p_company_id uuid) ---
alter function public."get_assignable_roles"(p_company_id uuid) set schema internal;
alter function internal."get_assignable_roles"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_assignable_roles"(p_company_id uuid)
 returns TABLE(id uuid, name text, is_system boolean, role_type text)
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."get_assignable_roles"(p_company_id); $w$;
revoke all on function public."get_assignable_roles"(p_company_id uuid) from public;
revoke all on function internal."get_assignable_roles"(p_company_id uuid) from public;
grant execute on function public."get_assignable_roles"(p_company_id uuid) to service_role;
grant execute on function internal."get_assignable_roles"(p_company_id uuid) to service_role;
grant execute on function public."get_assignable_roles"(p_company_id uuid) to authenticated;
grant execute on function internal."get_assignable_roles"(p_company_id uuid) to authenticated;
comment on function public."get_assignable_roles"(p_company_id uuid) is 'Users-page assignable role catalog. Tenant-scoped DEFAULT + CUSTOM roles for p_company_id. Requires users.edit.';

-- --- get_billing_payment_options_v1(p_company_id uuid) ---
alter function public."get_billing_payment_options_v1"(p_company_id uuid) set schema internal;
alter function internal."get_billing_payment_options_v1"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_billing_payment_options_v1"(p_company_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_billing_payment_options_v1"(p_company_id); $w$;
revoke all on function public."get_billing_payment_options_v1"(p_company_id uuid) from public;
revoke all on function internal."get_billing_payment_options_v1"(p_company_id uuid) from public;
grant execute on function public."get_billing_payment_options_v1"(p_company_id uuid) to service_role;
grant execute on function internal."get_billing_payment_options_v1"(p_company_id uuid) to service_role;
grant execute on function public."get_billing_payment_options_v1"(p_company_id uuid) to authenticated;
grant execute on function internal."get_billing_payment_options_v1"(p_company_id uuid) to authenticated;

-- --- get_billing_revenue_metrics_v1() ---
alter function public."get_billing_revenue_metrics_v1"() set schema internal;
alter function internal."get_billing_revenue_metrics_v1"() set search_path to internal, public;
create or replace function public."get_billing_revenue_metrics_v1"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_billing_revenue_metrics_v1"(); $w$;
revoke all on function public."get_billing_revenue_metrics_v1"() from public;
revoke all on function internal."get_billing_revenue_metrics_v1"() from public;
grant execute on function public."get_billing_revenue_metrics_v1"() to service_role;
grant execute on function internal."get_billing_revenue_metrics_v1"() to service_role;
grant execute on function public."get_billing_revenue_metrics_v1"() to authenticated;
grant execute on function internal."get_billing_revenue_metrics_v1"() to authenticated;

-- --- get_billing_setting(p_code text, p_company_id uuid) ---
alter function public."get_billing_setting"(p_code text, p_company_id uuid) set schema internal;
alter function internal."get_billing_setting"(p_code text, p_company_id uuid) set search_path to internal, public;
create or replace function public."get_billing_setting"(p_code text, p_company_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_billing_setting"(p_code, p_company_id); $w$;
revoke all on function public."get_billing_setting"(p_code text, p_company_id uuid) from public;
revoke all on function internal."get_billing_setting"(p_code text, p_company_id uuid) from public;
grant execute on function public."get_billing_setting"(p_code text, p_company_id uuid) to service_role;
grant execute on function internal."get_billing_setting"(p_code text, p_company_id uuid) to service_role;
grant execute on function public."get_billing_setting"(p_code text, p_company_id uuid) to authenticated;
grant execute on function internal."get_billing_setting"(p_code text, p_company_id uuid) to authenticated;

-- --- get_billing_settings_by_category(p_category text, p_scope_type text, p_company_id uuid) ---
alter function public."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) set schema internal;
alter function internal."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) set search_path to internal, public;
create or replace function public."get_billing_settings_by_category"(p_category text, p_scope_type text DEFAULT 'platform'::text, p_company_id uuid DEFAULT NULL::uuid)
 returns TABLE(code text, category text, label text, description text, value_type text, scope_type text, value jsonb, default_value jsonb, version integer, validation_schema jsonb)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."get_billing_settings_by_category"(p_category, p_scope_type, p_company_id); $w$;
revoke all on function public."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) from public;
revoke all on function internal."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) from public;
grant execute on function public."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) to service_role;
grant execute on function internal."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) to service_role;
grant execute on function public."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) to authenticated;
grant execute on function internal."get_billing_settings_by_category"(p_category text, p_scope_type text, p_company_id uuid) to authenticated;

-- --- get_company_access_state(p_company_id uuid) ---
alter function public."get_company_access_state"(p_company_id uuid) set schema internal;
alter function internal."get_company_access_state"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_access_state"(p_company_id uuid)
 returns text
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_company_access_state"(p_company_id); $w$;
revoke all on function public."get_company_access_state"(p_company_id uuid) from public;
revoke all on function internal."get_company_access_state"(p_company_id uuid) from public;
grant execute on function public."get_company_access_state"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_access_state"(p_company_id uuid) to service_role;
grant execute on function public."get_company_access_state"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_access_state"(p_company_id uuid) to authenticated;

-- --- get_company_email_settings(p_company_id uuid) ---
alter function public."get_company_email_settings"(p_company_id uuid) set schema internal;
alter function internal."get_company_email_settings"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_email_settings"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_company_email_settings"(p_company_id); $w$;
revoke all on function public."get_company_email_settings"(p_company_id uuid) from public;
revoke all on function internal."get_company_email_settings"(p_company_id uuid) from public;
grant execute on function public."get_company_email_settings"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_email_settings"(p_company_id uuid) to service_role;
grant execute on function public."get_company_email_settings"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_email_settings"(p_company_id uuid) to authenticated;

-- --- get_company_entitlements(p_company_id uuid) ---
alter function public."get_company_entitlements"(p_company_id uuid) set schema internal;
alter function internal."get_company_entitlements"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_entitlements"(p_company_id uuid)
 returns TABLE(feature_code text, label text, category text, enabled boolean, source text, limit_value jsonb, starts_at timestamp with time zone, expires_at timestamp with time zone, notes text, is_commercial boolean, override_state text)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."get_company_entitlements"(p_company_id); $w$;
revoke all on function public."get_company_entitlements"(p_company_id uuid) from public;
revoke all on function internal."get_company_entitlements"(p_company_id uuid) from public;
grant execute on function public."get_company_entitlements"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_entitlements"(p_company_id uuid) to service_role;
grant execute on function public."get_company_entitlements"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_entitlements"(p_company_id uuid) to authenticated;

-- --- get_company_instagram_settings(p_company_id uuid) ---
alter function public."get_company_instagram_settings"(p_company_id uuid) set schema internal;
alter function internal."get_company_instagram_settings"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_instagram_settings"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_company_instagram_settings"(p_company_id); $w$;
revoke all on function public."get_company_instagram_settings"(p_company_id uuid) from public;
revoke all on function internal."get_company_instagram_settings"(p_company_id uuid) from public;
grant execute on function public."get_company_instagram_settings"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_instagram_settings"(p_company_id uuid) to service_role;
grant execute on function public."get_company_instagram_settings"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_instagram_settings"(p_company_id uuid) to authenticated;

-- --- get_company_messenger_settings(p_company_id uuid) ---
alter function public."get_company_messenger_settings"(p_company_id uuid) set schema internal;
alter function internal."get_company_messenger_settings"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_messenger_settings"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_company_messenger_settings"(p_company_id); $w$;
revoke all on function public."get_company_messenger_settings"(p_company_id uuid) from public;
revoke all on function internal."get_company_messenger_settings"(p_company_id uuid) from public;
grant execute on function public."get_company_messenger_settings"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_messenger_settings"(p_company_id uuid) to service_role;
grant execute on function public."get_company_messenger_settings"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_messenger_settings"(p_company_id uuid) to authenticated;

-- --- get_company_whatsapp_settings(p_company_id uuid) ---
alter function public."get_company_whatsapp_settings"(p_company_id uuid) set schema internal;
alter function internal."get_company_whatsapp_settings"(p_company_id uuid) set search_path to internal, public;
create or replace function public."get_company_whatsapp_settings"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_company_whatsapp_settings"(p_company_id); $w$;
revoke all on function public."get_company_whatsapp_settings"(p_company_id uuid) from public;
revoke all on function internal."get_company_whatsapp_settings"(p_company_id uuid) from public;
grant execute on function public."get_company_whatsapp_settings"(p_company_id uuid) to service_role;
grant execute on function internal."get_company_whatsapp_settings"(p_company_id uuid) to service_role;
grant execute on function public."get_company_whatsapp_settings"(p_company_id uuid) to authenticated;
grant execute on function internal."get_company_whatsapp_settings"(p_company_id uuid) to authenticated;

-- --- get_enterprise_demo_status_v1() ---
alter function public."get_enterprise_demo_status_v1"() set schema internal;
alter function internal."get_enterprise_demo_status_v1"() set search_path to internal, public;
create or replace function public."get_enterprise_demo_status_v1"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_enterprise_demo_status_v1"(); $w$;
revoke all on function public."get_enterprise_demo_status_v1"() from public;
revoke all on function internal."get_enterprise_demo_status_v1"() from public;
grant execute on function public."get_enterprise_demo_status_v1"() to service_role;
grant execute on function internal."get_enterprise_demo_status_v1"() to service_role;
grant execute on function public."get_enterprise_demo_status_v1"() to authenticated;
grant execute on function internal."get_enterprise_demo_status_v1"() to authenticated;

-- --- get_payment_provider_health_v1() ---
alter function public."get_payment_provider_health_v1"() set schema internal;
alter function internal."get_payment_provider_health_v1"() set search_path to internal, public;
create or replace function public."get_payment_provider_health_v1"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_payment_provider_health_v1"(); $w$;
revoke all on function public."get_payment_provider_health_v1"() from public;
revoke all on function internal."get_payment_provider_health_v1"() from public;
grant execute on function public."get_payment_provider_health_v1"() to service_role;
grant execute on function internal."get_payment_provider_health_v1"() to service_role;
grant execute on function public."get_payment_provider_health_v1"() to authenticated;
grant execute on function internal."get_payment_provider_health_v1"() to authenticated;

-- --- get_user_company_id() ---
alter function public."get_user_company_id"() set schema internal;
alter function internal."get_user_company_id"() set search_path to internal, public;
create or replace function public."get_user_company_id"()
 returns uuid
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_user_company_id"(); $w$;
revoke all on function public."get_user_company_id"() from public;
revoke all on function internal."get_user_company_id"() from public;
grant execute on function public."get_user_company_id"() to service_role;
grant execute on function internal."get_user_company_id"() to service_role;
grant execute on function public."get_user_company_id"() to authenticated;
grant execute on function internal."get_user_company_id"() to authenticated;

-- --- get_workspace_billing_summary_v1() ---
alter function public."get_workspace_billing_summary_v1"() set schema internal;
alter function internal."get_workspace_billing_summary_v1"() set search_path to internal, public;
create or replace function public."get_workspace_billing_summary_v1"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."get_workspace_billing_summary_v1"(); $w$;
revoke all on function public."get_workspace_billing_summary_v1"() from public;
revoke all on function internal."get_workspace_billing_summary_v1"() from public;
grant execute on function public."get_workspace_billing_summary_v1"() to service_role;
grant execute on function internal."get_workspace_billing_summary_v1"() to service_role;
grant execute on function public."get_workspace_billing_summary_v1"() to authenticated;
grant execute on function internal."get_workspace_billing_summary_v1"() to authenticated;

-- --- integration_record_api_key_usage(p_key_id uuid) ---
alter function public."integration_record_api_key_usage"(p_key_id uuid) set schema internal;
alter function internal."integration_record_api_key_usage"(p_key_id uuid) set search_path to internal, public;
create or replace function public."integration_record_api_key_usage"(p_key_id uuid)
 returns void
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select from internal."integration_record_api_key_usage"(p_key_id); $w$;
revoke all on function public."integration_record_api_key_usage"(p_key_id uuid) from public;
revoke all on function internal."integration_record_api_key_usage"(p_key_id uuid) from public;
grant execute on function public."integration_record_api_key_usage"(p_key_id uuid) to service_role;
grant execute on function internal."integration_record_api_key_usage"(p_key_id uuid) to service_role;
grant execute on function public."integration_record_api_key_usage"(p_key_id uuid) to authenticated;
grant execute on function internal."integration_record_api_key_usage"(p_key_id uuid) to authenticated;

-- --- integration_validate_api_key(p_key_hash text) ---
alter function public."integration_validate_api_key"(p_key_hash text) set schema internal;
alter function internal."integration_validate_api_key"(p_key_hash text) set search_path to internal, public;
create or replace function public."integration_validate_api_key"(p_key_hash text)
 returns TABLE(key_id uuid, company_id uuid, scopes text[], ip_allowlist text[], is_active boolean, expires_at timestamp with time zone)
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."integration_validate_api_key"(p_key_hash); $w$;
revoke all on function public."integration_validate_api_key"(p_key_hash text) from public;
revoke all on function internal."integration_validate_api_key"(p_key_hash text) from public;
grant execute on function public."integration_validate_api_key"(p_key_hash text) to service_role;
grant execute on function internal."integration_validate_api_key"(p_key_hash text) to service_role;
grant execute on function public."integration_validate_api_key"(p_key_hash text) to authenticated;
grant execute on function internal."integration_validate_api_key"(p_key_hash text) to authenticated;

-- --- is_company_admin() ---
alter function public."is_company_admin"() set schema internal;
alter function internal."is_company_admin"() set search_path to internal, public;
create or replace function public."is_company_admin"()
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."is_company_admin"(); $w$;
revoke all on function public."is_company_admin"() from public;
revoke all on function internal."is_company_admin"() from public;
grant execute on function public."is_company_admin"() to service_role;
grant execute on function internal."is_company_admin"() to service_role;
grant execute on function public."is_company_admin"() to authenticated;
grant execute on function internal."is_company_admin"() to authenticated;
comment on function public."is_company_admin"() is 'Deprecated shim ΓÇö resolves to users.edit permission. Do not use in new policies.';

-- --- is_feature_enabled(p_company_id uuid, p_feature_code text) ---
alter function public."is_feature_enabled"(p_company_id uuid, p_feature_code text) set schema internal;
alter function internal."is_feature_enabled"(p_company_id uuid, p_feature_code text) set search_path to internal, public;
create or replace function public."is_feature_enabled"(p_company_id uuid, p_feature_code text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."is_feature_enabled"(p_company_id, p_feature_code); $w$;
revoke all on function public."is_feature_enabled"(p_company_id uuid, p_feature_code text) from public;
revoke all on function internal."is_feature_enabled"(p_company_id uuid, p_feature_code text) from public;
grant execute on function public."is_feature_enabled"(p_company_id uuid, p_feature_code text) to service_role;
grant execute on function internal."is_feature_enabled"(p_company_id uuid, p_feature_code text) to service_role;
grant execute on function public."is_feature_enabled"(p_company_id uuid, p_feature_code text) to authenticated;
grant execute on function internal."is_feature_enabled"(p_company_id uuid, p_feature_code text) to authenticated;

-- --- is_platform_billing_operator() ---
alter function public."is_platform_billing_operator"() set schema internal;
alter function internal."is_platform_billing_operator"() set search_path to internal, public;
create or replace function public."is_platform_billing_operator"()
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."is_platform_billing_operator"(); $w$;
revoke all on function public."is_platform_billing_operator"() from public;
revoke all on function internal."is_platform_billing_operator"() from public;
grant execute on function public."is_platform_billing_operator"() to service_role;
grant execute on function internal."is_platform_billing_operator"() to service_role;
grant execute on function public."is_platform_billing_operator"() to authenticated;
grant execute on function internal."is_platform_billing_operator"() to authenticated;

-- --- is_super_admin() ---
alter function public."is_super_admin"() set schema internal;
alter function internal."is_super_admin"() set search_path to internal, public;
create or replace function public."is_super_admin"()
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."is_super_admin"(); $w$;
revoke all on function public."is_super_admin"() from public;
revoke all on function internal."is_super_admin"() from public;
grant execute on function public."is_super_admin"() to service_role;
grant execute on function internal."is_super_admin"() to service_role;
grant execute on function public."is_super_admin"() to authenticated;
grant execute on function internal."is_super_admin"() to authenticated;

-- --- knowledge_keyword_search(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) ---
alter function public."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) set schema internal;
alter function internal."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) set search_path to internal, public;
create or replace function public."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer DEFAULT 20, p_source_ids uuid[] DEFAULT NULL::uuid[], p_document_ids uuid[] DEFAULT NULL::uuid[])
 returns TABLE(chunk_id uuid, document_id uuid, source_id uuid, document_title text, section_title text, content text, rank real, page_number integer)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."knowledge_keyword_search"(p_company_id, p_query, p_limit, p_source_ids, p_document_ids); $w$;
revoke all on function public."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) from public;
revoke all on function internal."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) from public;
grant execute on function public."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) to service_role;
grant execute on function internal."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) to service_role;
grant execute on function public."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) to authenticated;
grant execute on function internal."knowledge_keyword_search"(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) to authenticated;

-- --- list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text) ---
alter function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) set schema internal;
alter function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) set search_path to internal, public;
create or replace function public."list_billing_audit_logs_paged"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_event_type text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_audit_logs_paged"(p_limit, p_offset, p_search, p_event_type); $w$;
revoke all on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) from public;
revoke all on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) from public;
grant execute on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) to service_role;
grant execute on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text) to service_role;

-- --- list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) ---
alter function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) set schema internal;
alter function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) set search_path to internal, public;
create or replace function public."list_billing_audit_logs_paged"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_event_type text DEFAULT NULL::text, p_for_export boolean DEFAULT false)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_audit_logs_paged"(p_limit, p_offset, p_search, p_event_type, p_for_export); $w$;
revoke all on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) from public;
revoke all on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) from public;
grant execute on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) to service_role;
grant execute on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) to service_role;
grant execute on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) to authenticated;
grant execute on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) to authenticated;

-- --- list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) ---
alter function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) set schema internal;
alter function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) set search_path to internal, public;
create or replace function public."list_billing_audit_logs_paged"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_event_type text DEFAULT NULL::text, p_for_export boolean DEFAULT false, p_company_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_audit_logs_paged"(p_limit, p_offset, p_search, p_event_type, p_for_export, p_company_id); $w$;
revoke all on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) from public;
revoke all on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) from public;
grant execute on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) to service_role;
grant execute on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) to service_role;
grant execute on function public."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) to authenticated;
grant execute on function internal."list_billing_audit_logs_paged"(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) to authenticated;

-- --- list_billing_invoices_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text) ---
alter function public."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) set schema internal;
alter function internal."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) set search_path to internal, public;
create or replace function public."list_billing_invoices_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_invoices_paged_v1"(p_limit, p_offset, p_search, p_status); $w$;
revoke all on function public."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
revoke all on function internal."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
grant execute on function public."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;
grant execute on function internal."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;
grant execute on function public."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to authenticated;
grant execute on function internal."list_billing_invoices_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to authenticated;

-- --- list_billing_payment_failures_paged_v1(p_limit integer, p_offset integer, p_search text) ---
alter function public."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) set schema internal;
alter function internal."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) set search_path to internal, public;
create or replace function public."list_billing_payment_failures_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_payment_failures_paged_v1"(p_limit, p_offset, p_search); $w$;
revoke all on function public."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) from public;
revoke all on function internal."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) from public;
grant execute on function public."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function internal."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function public."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) to authenticated;
grant execute on function internal."list_billing_payment_failures_paged_v1"(p_limit integer, p_offset integer, p_search text) to authenticated;

-- --- list_billing_payments_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text) ---
alter function public."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) set schema internal;
alter function internal."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) set search_path to internal, public;
create or replace function public."list_billing_payments_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_payments_paged_v1"(p_limit, p_offset, p_search, p_status); $w$;
revoke all on function public."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
revoke all on function internal."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
grant execute on function public."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;
grant execute on function internal."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;
grant execute on function public."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to authenticated;
grant execute on function internal."list_billing_payments_paged_v1"(p_limit integer, p_offset integer, p_search text, p_status text) to authenticated;

-- --- list_billing_receipts_paged_v1(p_limit integer, p_offset integer, p_search text) ---
alter function public."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) set schema internal;
alter function internal."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) set search_path to internal, public;
create or replace function public."list_billing_receipts_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_billing_receipts_paged_v1"(p_limit, p_offset, p_search); $w$;
revoke all on function public."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) from public;
revoke all on function internal."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) from public;
grant execute on function public."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function internal."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function public."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) to authenticated;
grant execute on function internal."list_billing_receipts_paged_v1"(p_limit integer, p_offset integer, p_search text) to authenticated;

-- --- list_company_employee_auth_meta(p_company_id uuid) ---
alter function public."list_company_employee_auth_meta"(p_company_id uuid) set schema internal;
alter function internal."list_company_employee_auth_meta"(p_company_id uuid) set search_path to internal, public;
create or replace function public."list_company_employee_auth_meta"(p_company_id uuid)
 returns TABLE(user_id uuid, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."list_company_employee_auth_meta"(p_company_id); $w$;
revoke all on function public."list_company_employee_auth_meta"(p_company_id uuid) from public;
revoke all on function internal."list_company_employee_auth_meta"(p_company_id uuid) from public;
grant execute on function public."list_company_employee_auth_meta"(p_company_id uuid) to service_role;
grant execute on function internal."list_company_employee_auth_meta"(p_company_id uuid) to service_role;
grant execute on function public."list_company_employee_auth_meta"(p_company_id uuid) to authenticated;
grant execute on function internal."list_company_employee_auth_meta"(p_company_id uuid) to authenticated;
comment on function public."list_company_employee_auth_meta"(p_company_id uuid) is 'Returns auth last_sign_in / invite metadata for employees of a company.';

-- --- list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text) ---
alter function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) set schema internal;
alter function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) set search_path to internal, public;
create or replace function public."list_company_subscriptions_paged"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_company_subscriptions_paged"(p_limit, p_offset, p_search, p_status); $w$;
revoke all on function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
revoke all on function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) from public;
grant execute on function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;
grant execute on function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text) to service_role;

-- --- list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) ---
alter function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) set schema internal;
alter function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) set search_path to internal, public;
create or replace function public."list_company_subscriptions_paged"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_billing_cycle text DEFAULT NULL::text, p_sort_by text DEFAULT 'renewal'::text, p_sort_dir text DEFAULT 'desc'::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_company_subscriptions_paged"(p_limit, p_offset, p_search, p_status, p_billing_cycle, p_sort_by, p_sort_dir); $w$;
revoke all on function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) from public;
revoke all on function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) from public;
grant execute on function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) to service_role;
grant execute on function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) to service_role;
grant execute on function public."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) to authenticated;
grant execute on function internal."list_company_subscriptions_paged"(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) to authenticated;

-- --- list_enterprise_demo_scenarios_v1() ---
alter function public."list_enterprise_demo_scenarios_v1"() set schema internal;
alter function internal."list_enterprise_demo_scenarios_v1"() set search_path to internal, public;
create or replace function public."list_enterprise_demo_scenarios_v1"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_enterprise_demo_scenarios_v1"(); $w$;
revoke all on function public."list_enterprise_demo_scenarios_v1"() from public;
revoke all on function internal."list_enterprise_demo_scenarios_v1"() from public;
grant execute on function public."list_enterprise_demo_scenarios_v1"() to service_role;
grant execute on function internal."list_enterprise_demo_scenarios_v1"() to service_role;
grant execute on function public."list_enterprise_demo_scenarios_v1"() to authenticated;
grant execute on function internal."list_enterprise_demo_scenarios_v1"() to authenticated;

-- --- list_expiring_subscriptions_paged_v1(p_limit integer, p_offset integer) ---
alter function public."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) set schema internal;
alter function internal."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) set search_path to internal, public;
create or replace function public."list_expiring_subscriptions_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_expiring_subscriptions_paged_v1"(p_limit, p_offset); $w$;
revoke all on function public."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) from public;
revoke all on function internal."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) from public;
grant execute on function public."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) to service_role;
grant execute on function internal."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) to service_role;
grant execute on function public."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) to authenticated;
grant execute on function internal."list_expiring_subscriptions_paged_v1"(p_limit integer, p_offset integer) to authenticated;

-- --- list_upcoming_renewals_paged_v1(p_limit integer, p_offset integer, p_days integer) ---
alter function public."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) set schema internal;
alter function internal."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) set search_path to internal, public;
create or replace function public."list_upcoming_renewals_paged_v1"(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_days integer DEFAULT 30)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."list_upcoming_renewals_paged_v1"(p_limit, p_offset, p_days); $w$;
revoke all on function public."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) from public;
revoke all on function internal."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) from public;
grant execute on function public."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) to service_role;
grant execute on function internal."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) to service_role;
grant execute on function public."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) to authenticated;
grant execute on function internal."list_upcoming_renewals_paged_v1"(p_limit integer, p_offset integer, p_days integer) to authenticated;

-- --- load_user_auth_context(p_user_id uuid) ---
alter function public."load_user_auth_context"(p_user_id uuid) set schema internal;
alter function internal."load_user_auth_context"(p_user_id uuid) set search_path to internal, public;
create or replace function public."load_user_auth_context"(p_user_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."load_user_auth_context"(p_user_id); $w$;
revoke all on function public."load_user_auth_context"(p_user_id uuid) from public;
revoke all on function internal."load_user_auth_context"(p_user_id uuid) from public;
grant execute on function public."load_user_auth_context"(p_user_id uuid) to service_role;
grant execute on function internal."load_user_auth_context"(p_user_id uuid) to service_role;
grant execute on function public."load_user_auth_context"(p_user_id uuid) to authenticated;
grant execute on function internal."load_user_auth_context"(p_user_id uuid) to authenticated;
comment on function public."load_user_auth_context"(p_user_id uuid) is 'Single-round-trip auth bootstrap: profile (incl. preferences), company (incl. approval_status), roles, permissions.';

-- --- mark_subscription_past_due_v1(p_company_id uuid, p_reason text) ---
alter function public."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) set schema internal;
alter function internal."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."mark_subscription_past_due_v1"(p_company_id, p_reason); $w$;
revoke all on function public."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) from public;
revoke all on function internal."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) from public;
grant execute on function public."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function internal."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function public."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) to authenticated;
grant execute on function internal."mark_subscription_past_due_v1"(p_company_id uuid, p_reason text) to authenticated;

-- --- notification_bus_publish_v1(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) ---
alter function public."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) set schema internal;
alter function internal."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) set search_path to internal, public;
create or replace function public."notification_bus_publish_v1"(p_event_code text, p_company_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_channels text[] DEFAULT NULL::text[], p_idempotency_key text DEFAULT NULL::text)
 returns uuid
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."notification_bus_publish_v1"(p_event_code, p_company_id, p_payload, p_channels, p_idempotency_key); $w$;
revoke all on function public."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) from public;
revoke all on function internal."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) from public;
grant execute on function public."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) to service_role;
grant execute on function internal."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) to service_role;
grant execute on function public."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) to authenticated;
grant execute on function internal."notification_bus_publish_v1"(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) to authenticated;

-- --- onboard_own_company_v1(p_payload jsonb) ---
alter function public."onboard_own_company_v1"(p_payload jsonb) set schema internal;
alter function internal."onboard_own_company_v1"(p_payload jsonb) set search_path to internal, public;
create or replace function public."onboard_own_company_v1"(p_payload jsonb)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."onboard_own_company_v1"(p_payload); $w$;
revoke all on function public."onboard_own_company_v1"(p_payload jsonb) from public;
revoke all on function internal."onboard_own_company_v1"(p_payload jsonb) from public;
grant execute on function public."onboard_own_company_v1"(p_payload jsonb) to service_role;
grant execute on function internal."onboard_own_company_v1"(p_payload jsonb) to service_role;
grant execute on function public."onboard_own_company_v1"(p_payload jsonb) to authenticated;
grant execute on function internal."onboard_own_company_v1"(p_payload jsonb) to authenticated;
comment on function public."onboard_own_company_v1"(p_payload jsonb) is 'First-time authenticated users without a company create their tenant, billing identity, HQ branch, and Company Admin membership in one transaction.';

-- --- organization_merge_departments(p_source_id uuid, p_target_id uuid) ---
alter function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid) set schema internal;
alter function internal."organization_merge_departments"(p_source_id uuid, p_target_id uuid) set search_path to internal, public;
create or replace function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid)
 returns void
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select from internal."organization_merge_departments"(p_source_id, p_target_id); $w$;
revoke all on function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid) from public;
revoke all on function internal."organization_merge_departments"(p_source_id uuid, p_target_id uuid) from public;
grant execute on function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid) to service_role;
grant execute on function internal."organization_merge_departments"(p_source_id uuid, p_target_id uuid) to service_role;
grant execute on function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid) to authenticated;
grant execute on function internal."organization_merge_departments"(p_source_id uuid, p_target_id uuid) to authenticated;
comment on function public."organization_merge_departments"(p_source_id uuid, p_target_id uuid) is 'Merges a source department into a target: resources, children, employee labels; deactivates source.';

-- --- organization_resolve_policy(p_company_id uuid, p_branch_id uuid, p_policy_type text) ---
alter function public."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) set schema internal;
alter function internal."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) set search_path to internal, public;
create or replace function public."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."organization_resolve_policy"(p_company_id, p_branch_id, p_policy_type); $w$;
revoke all on function public."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) from public;
revoke all on function internal."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) from public;
grant execute on function public."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) to service_role;
grant execute on function internal."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) to service_role;
grant execute on function public."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) to authenticated;
grant execute on function internal."organization_resolve_policy"(p_company_id uuid, p_branch_id uuid, p_policy_type text) to authenticated;

-- --- organization_search(p_company_id uuid, p_query text, p_limit integer) ---
alter function public."organization_search"(p_company_id uuid, p_query text, p_limit integer) set schema internal;
alter function internal."organization_search"(p_company_id uuid, p_query text, p_limit integer) set search_path to internal, public;
create or replace function public."organization_search"(p_company_id uuid, p_query text, p_limit integer DEFAULT 20)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."organization_search"(p_company_id, p_query, p_limit); $w$;
revoke all on function public."organization_search"(p_company_id uuid, p_query text, p_limit integer) from public;
revoke all on function internal."organization_search"(p_company_id uuid, p_query text, p_limit integer) from public;
grant execute on function public."organization_search"(p_company_id uuid, p_query text, p_limit integer) to service_role;
grant execute on function internal."organization_search"(p_company_id uuid, p_query text, p_limit integer) to service_role;
grant execute on function public."organization_search"(p_company_id uuid, p_query text, p_limit integer) to authenticated;
grant execute on function internal."organization_search"(p_company_id uuid, p_query text, p_limit integer) to authenticated;

-- --- pgvector_collection_statistics(p_company_id uuid, p_collection_name text) ---
alter function public."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) set schema internal;
alter function internal."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) set search_path to internal, public;
create or replace function public."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."pgvector_collection_statistics"(p_company_id, p_collection_name); $w$;
revoke all on function public."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) from public;
revoke all on function internal."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) from public;
grant execute on function public."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) to service_role;
grant execute on function internal."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) to service_role;
grant execute on function public."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) to authenticated;
grant execute on function internal."pgvector_collection_statistics"(p_company_id uuid, p_collection_name text) to authenticated;

-- --- pgvector_create_collection(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) ---
alter function public."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) set schema internal;
alter function internal."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) set search_path to internal, public;
create or replace function public."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."pgvector_create_collection"(p_company_id, p_collection_name, p_dimensions, p_metadata); $w$;
revoke all on function public."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) from public;
revoke all on function internal."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) from public;
grant execute on function public."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) to service_role;
grant execute on function internal."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) to service_role;
grant execute on function public."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) to authenticated;
grant execute on function internal."pgvector_create_collection"(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) to authenticated;

-- --- pgvector_delete_collection(p_company_id uuid, p_collection_name text) ---
alter function public."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) set schema internal;
alter function internal."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) set search_path to internal, public;
create or replace function public."pgvector_delete_collection"(p_company_id uuid, p_collection_name text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."pgvector_delete_collection"(p_company_id, p_collection_name); $w$;
revoke all on function public."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) from public;
revoke all on function internal."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) from public;
grant execute on function public."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) to service_role;
grant execute on function internal."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) to service_role;
grant execute on function public."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) to authenticated;
grant execute on function internal."pgvector_delete_collection"(p_company_id uuid, p_collection_name text) to authenticated;

-- --- pgvector_delete_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid) ---
alter function public."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) set schema internal;
alter function internal."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) set search_path to internal, public;
create or replace function public."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."pgvector_delete_vector"(p_company_id, p_collection_name, p_vector_id); $w$;
revoke all on function public."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) from public;
revoke all on function internal."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) from public;
grant execute on function public."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) to service_role;
grant execute on function internal."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) to service_role;
grant execute on function public."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) to authenticated;
grant execute on function internal."pgvector_delete_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid) to authenticated;

-- --- pgvector_similarity_search(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) ---
alter function public."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) set schema internal;
alter function internal."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) set search_path to internal, public;
create or replace function public."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer DEFAULT 10, p_metadata_filter jsonb DEFAULT '{}'::jsonb)
 returns TABLE(vector_id uuid, provider_score double precision, metadata jsonb)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."pgvector_similarity_search"(p_company_id, p_collection_name, p_query_vector, p_top_k, p_metadata_filter); $w$;
revoke all on function public."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) from public;
revoke all on function internal."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) from public;
grant execute on function public."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) to service_role;
grant execute on function internal."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) to service_role;
grant execute on function public."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) to authenticated;
grant execute on function internal."pgvector_similarity_search"(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) to authenticated;

-- --- pgvector_upsert_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) ---
alter function public."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) set schema internal;
alter function internal."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) set search_path to internal, public;
create or replace function public."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb DEFAULT '{}'::jsonb)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."pgvector_upsert_vector"(p_company_id, p_collection_name, p_vector_id, p_vector, p_metadata); $w$;
revoke all on function public."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) from public;
revoke all on function internal."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) from public;
grant execute on function public."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) to service_role;
grant execute on function internal."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) to service_role;
grant execute on function public."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) to authenticated;
grant execute on function internal."pgvector_upsert_vector"(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) to authenticated;

-- --- platform_ai_feature_enabled(p_company_id uuid, p_feature_key text) ---
alter function public."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) set schema internal;
alter function internal."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) set search_path to internal, public;
create or replace function public."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_feature_enabled"(p_company_id, p_feature_key); $w$;
revoke all on function public."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) from public;
revoke all on function internal."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) from public;
grant execute on function public."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) to service_role;
grant execute on function internal."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) to service_role;
grant execute on function public."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) to authenticated;
grant execute on function internal."platform_ai_feature_enabled"(p_company_id uuid, p_feature_key text) to authenticated;

-- --- platform_ai_ops_admin_audit(p_limit integer) ---
alter function public."platform_ai_ops_admin_audit"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_admin_audit"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_admin_audit"(p_limit integer DEFAULT 50)
 returns TABLE(id uuid, created_at timestamp with time zone, action text, entity text, company_id uuid, user_id uuid, metadata jsonb)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_admin_audit"(p_limit); $w$;
revoke all on function public."platform_ai_ops_admin_audit"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_admin_audit"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_admin_audit"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_admin_audit"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_admin_audit"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_admin_audit"(p_limit integer) to authenticated;

-- --- platform_ai_ops_agent_workflows(p_limit integer) ---
alter function public."platform_ai_ops_agent_workflows"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_agent_workflows"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_agent_workflows"(p_limit integer DEFAULT 20)
 returns TABLE(id uuid, company_id uuid, company_name text, goal text, status text, progress numeric, task_count integer, correlation_id text, agent_type text, tools_used text[], created_at timestamp with time zone, updated_at timestamp with time zone)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_agent_workflows"(p_limit); $w$;
revoke all on function public."platform_ai_ops_agent_workflows"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_agent_workflows"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_agent_workflows"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_agent_workflows"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_agent_workflows"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_agent_workflows"(p_limit integer) to authenticated;

-- --- platform_ai_ops_cost_by_company(p_limit integer) ---
alter function public."platform_ai_ops_cost_by_company"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_cost_by_company"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_cost_by_company"(p_limit integer DEFAULT 10)
 returns TABLE(company_id uuid, company_name text, total_tokens bigint, estimated_cost numeric, request_count bigint)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_cost_by_company"(p_limit); $w$;
revoke all on function public."platform_ai_ops_cost_by_company"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_cost_by_company"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_cost_by_company"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_cost_by_company"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_cost_by_company"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_cost_by_company"(p_limit integer) to authenticated;

-- --- platform_ai_ops_cost_trends(p_days integer) ---
alter function public."platform_ai_ops_cost_trends"(p_days integer) set schema internal;
alter function internal."platform_ai_ops_cost_trends"(p_days integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_cost_trends"(p_days integer DEFAULT 30)
 returns TABLE(day date, total_tokens bigint, estimated_cost numeric, request_count bigint)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_cost_trends"(p_days); $w$;
revoke all on function public."platform_ai_ops_cost_trends"(p_days integer) from public;
revoke all on function internal."platform_ai_ops_cost_trends"(p_days integer) from public;
grant execute on function public."platform_ai_ops_cost_trends"(p_days integer) to service_role;
grant execute on function internal."platform_ai_ops_cost_trends"(p_days integer) to service_role;
grant execute on function public."platform_ai_ops_cost_trends"(p_days integer) to authenticated;
grant execute on function internal."platform_ai_ops_cost_trends"(p_days integer) to authenticated;

-- --- platform_ai_ops_crm_agent_summary() ---
alter function public."platform_ai_ops_crm_agent_summary"() set schema internal;
alter function internal."platform_ai_ops_crm_agent_summary"() set search_path to internal, public;
create or replace function public."platform_ai_ops_crm_agent_summary"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_ops_crm_agent_summary"(); $w$;
revoke all on function public."platform_ai_ops_crm_agent_summary"() from public;
revoke all on function internal."platform_ai_ops_crm_agent_summary"() from public;
grant execute on function public."platform_ai_ops_crm_agent_summary"() to service_role;
grant execute on function internal."platform_ai_ops_crm_agent_summary"() to service_role;
grant execute on function public."platform_ai_ops_crm_agent_summary"() to authenticated;
grant execute on function internal."platform_ai_ops_crm_agent_summary"() to authenticated;

-- --- platform_ai_ops_embedding_jobs(p_limit integer) ---
alter function public."platform_ai_ops_embedding_jobs"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_embedding_jobs"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_embedding_jobs"(p_limit integer DEFAULT 30)
 returns TABLE(id uuid, company_id uuid, company_name text, document_title text, status text, progress_pct numeric, retry_count integer, error_message text, provider text, model text, queued_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_embedding_jobs"(p_limit); $w$;
revoke all on function public."platform_ai_ops_embedding_jobs"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_embedding_jobs"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_embedding_jobs"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_embedding_jobs"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_embedding_jobs"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_embedding_jobs"(p_limit integer) to authenticated;

-- --- platform_ai_ops_error_groups(p_limit integer) ---
alter function public."platform_ai_ops_error_groups"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_error_groups"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_error_groups"(p_limit integer DEFAULT 25)
 returns TABLE(error_code text, error_category text, source_layer text, human_message text, first_seen timestamp with time zone, last_seen timestamp with time zone, occurrences bigint, affected_companies bigint, sample_correlation_id text, sample_stack text)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_error_groups"(p_limit); $w$;
revoke all on function public."platform_ai_ops_error_groups"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_error_groups"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_error_groups"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_error_groups"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_error_groups"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_error_groups"(p_limit integer) to authenticated;

-- --- platform_ai_ops_evaluate_alerts() ---
alter function public."platform_ai_ops_evaluate_alerts"() set schema internal;
alter function internal."platform_ai_ops_evaluate_alerts"() set search_path to internal, public;
create or replace function public."platform_ai_ops_evaluate_alerts"()
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_ops_evaluate_alerts"(); $w$;
revoke all on function public."platform_ai_ops_evaluate_alerts"() from public;
revoke all on function internal."platform_ai_ops_evaluate_alerts"() from public;
grant execute on function public."platform_ai_ops_evaluate_alerts"() to service_role;
grant execute on function internal."platform_ai_ops_evaluate_alerts"() to service_role;
grant execute on function public."platform_ai_ops_evaluate_alerts"() to authenticated;
grant execute on function internal."platform_ai_ops_evaluate_alerts"() to authenticated;

-- --- platform_ai_ops_feature_matrix() ---
alter function public."platform_ai_ops_feature_matrix"() set schema internal;
alter function internal."platform_ai_ops_feature_matrix"() set search_path to internal, public;
create or replace function public."platform_ai_ops_feature_matrix"()
 returns TABLE(company_id uuid, company_name text, ai_chat boolean, tool_calling boolean, knowledge boolean, automation boolean, voice boolean)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_feature_matrix"(); $w$;
revoke all on function public."platform_ai_ops_feature_matrix"() from public;
revoke all on function internal."platform_ai_ops_feature_matrix"() from public;
grant execute on function public."platform_ai_ops_feature_matrix"() to service_role;
grant execute on function internal."platform_ai_ops_feature_matrix"() to service_role;
grant execute on function public."platform_ai_ops_feature_matrix"() to authenticated;
grant execute on function internal."platform_ai_ops_feature_matrix"() to authenticated;

-- --- platform_ai_ops_knowledge_documents(p_limit integer) ---
alter function public."platform_ai_ops_knowledge_documents"(p_limit integer) set schema internal;
alter function internal."platform_ai_ops_knowledge_documents"(p_limit integer) set search_path to internal, public;
create or replace function public."platform_ai_ops_knowledge_documents"(p_limit integer DEFAULT 30)
 returns TABLE(id uuid, company_id uuid, company_name text, title text, status text, mime_type text, chunk_count bigint, embedding_status text, updated_at timestamp with time zone)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_knowledge_documents"(p_limit); $w$;
revoke all on function public."platform_ai_ops_knowledge_documents"(p_limit integer) from public;
revoke all on function internal."platform_ai_ops_knowledge_documents"(p_limit integer) from public;
grant execute on function public."platform_ai_ops_knowledge_documents"(p_limit integer) to service_role;
grant execute on function internal."platform_ai_ops_knowledge_documents"(p_limit integer) to service_role;
grant execute on function public."platform_ai_ops_knowledge_documents"(p_limit integer) to authenticated;
grant execute on function internal."platform_ai_ops_knowledge_documents"(p_limit integer) to authenticated;

-- --- platform_ai_ops_knowledge_summary() ---
alter function public."platform_ai_ops_knowledge_summary"() set schema internal;
alter function internal."platform_ai_ops_knowledge_summary"() set search_path to internal, public;
create or replace function public."platform_ai_ops_knowledge_summary"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_ops_knowledge_summary"(); $w$;
revoke all on function public."platform_ai_ops_knowledge_summary"() from public;
revoke all on function internal."platform_ai_ops_knowledge_summary"() from public;
grant execute on function public."platform_ai_ops_knowledge_summary"() to service_role;
grant execute on function internal."platform_ai_ops_knowledge_summary"() to service_role;
grant execute on function public."platform_ai_ops_knowledge_summary"() to authenticated;
grant execute on function internal."platform_ai_ops_knowledge_summary"() to authenticated;

-- --- platform_ai_ops_kpi_summary() ---
alter function public."platform_ai_ops_kpi_summary"() set schema internal;
alter function internal."platform_ai_ops_kpi_summary"() set search_path to internal, public;
create or replace function public."platform_ai_ops_kpi_summary"()
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_ops_kpi_summary"(); $w$;
revoke all on function public."platform_ai_ops_kpi_summary"() from public;
revoke all on function internal."platform_ai_ops_kpi_summary"() from public;
grant execute on function public."platform_ai_ops_kpi_summary"() to service_role;
grant execute on function internal."platform_ai_ops_kpi_summary"() to service_role;
grant execute on function public."platform_ai_ops_kpi_summary"() to authenticated;
grant execute on function internal."platform_ai_ops_kpi_summary"() to authenticated;

-- --- platform_ai_ops_provider_health(p_provider_key text) ---
alter function public."platform_ai_ops_provider_health"(p_provider_key text) set schema internal;
alter function internal."platform_ai_ops_provider_health"(p_provider_key text) set search_path to internal, public;
create or replace function public."platform_ai_ops_provider_health"(p_provider_key text DEFAULT 'openai'::text)
 returns jsonb
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_ai_ops_provider_health"(p_provider_key); $w$;
revoke all on function public."platform_ai_ops_provider_health"(p_provider_key text) from public;
revoke all on function internal."platform_ai_ops_provider_health"(p_provider_key text) from public;
grant execute on function public."platform_ai_ops_provider_health"(p_provider_key text) to service_role;
grant execute on function internal."platform_ai_ops_provider_health"(p_provider_key text) to service_role;
grant execute on function public."platform_ai_ops_provider_health"(p_provider_key text) to authenticated;
grant execute on function internal."platform_ai_ops_provider_health"(p_provider_key text) to authenticated;

-- --- platform_ai_ops_request_feed(p_limit integer, p_offset integer, p_search text) ---
alter function public."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) set schema internal;
alter function internal."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) set search_path to internal, public;
create or replace function public."platform_ai_ops_request_feed"(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text)
 returns TABLE(id uuid, recorded_at timestamp with time zone, company_id uuid, company_name text, user_id uuid, module text, prompt_type text, conversation_id uuid, tool_calling boolean, knowledge_used boolean, automation_used boolean, model text, provider_key text, total_tokens integer, latency_ms integer, estimated_cost numeric, result_status text, correlation_id text)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_request_feed"(p_limit, p_offset, p_search); $w$;
revoke all on function public."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) from public;
revoke all on function internal."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) from public;
grant execute on function public."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function internal."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) to service_role;
grant execute on function public."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) to authenticated;
grant execute on function internal."platform_ai_ops_request_feed"(p_limit integer, p_offset integer, p_search text) to authenticated;

-- --- platform_ai_ops_tool_stats() ---
alter function public."platform_ai_ops_tool_stats"() set schema internal;
alter function internal."platform_ai_ops_tool_stats"() set search_path to internal, public;
create or replace function public."platform_ai_ops_tool_stats"()
 returns TABLE(tool_name text, call_count bigint, success_count bigint, failure_count bigint, avg_duration_ms numeric, error_rate numeric)
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."platform_ai_ops_tool_stats"(); $w$;
revoke all on function public."platform_ai_ops_tool_stats"() from public;
revoke all on function internal."platform_ai_ops_tool_stats"() from public;
grant execute on function public."platform_ai_ops_tool_stats"() to service_role;
grant execute on function internal."platform_ai_ops_tool_stats"() to service_role;
grant execute on function public."platform_ai_ops_tool_stats"() to authenticated;
grant execute on function internal."platform_ai_ops_tool_stats"() to authenticated;

-- --- platform_health_check_v1() ---
alter function public."platform_health_check_v1"() set schema internal;
alter function internal."platform_health_check_v1"() set search_path to internal, public;
create or replace function public."platform_health_check_v1"()
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."platform_health_check_v1"(); $w$;
revoke all on function public."platform_health_check_v1"() from public;
revoke all on function internal."platform_health_check_v1"() from public;
grant execute on function public."platform_health_check_v1"() to service_role;
grant execute on function internal."platform_health_check_v1"() to service_role;
grant execute on function public."platform_health_check_v1"() to authenticated;
grant execute on function internal."platform_health_check_v1"() to authenticated;

-- --- plugin_list_enabled(p_company_id uuid) ---
alter function public."plugin_list_enabled"(p_company_id uuid) set schema internal;
alter function internal."plugin_list_enabled"(p_company_id uuid) set search_path to internal, public;
create or replace function public."plugin_list_enabled"(p_company_id uuid)
 returns TABLE(installation_id uuid, plugin_id text, version text, manifest jsonb, granted_permissions text[], settings jsonb)
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select * from internal."plugin_list_enabled"(p_company_id); $w$;
revoke all on function public."plugin_list_enabled"(p_company_id uuid) from public;
revoke all on function internal."plugin_list_enabled"(p_company_id uuid) from public;
grant execute on function public."plugin_list_enabled"(p_company_id uuid) to service_role;
grant execute on function internal."plugin_list_enabled"(p_company_id uuid) to service_role;
grant execute on function public."plugin_list_enabled"(p_company_id uuid) to authenticated;
grant execute on function internal."plugin_list_enabled"(p_company_id uuid) to authenticated;

-- --- portal_consume_check_in_token(p_token text) ---
alter function public."portal_consume_check_in_token"(p_token text) set schema internal;
alter function internal."portal_consume_check_in_token"(p_token text) set search_path to internal, public;
create or replace function public."portal_consume_check_in_token"(p_token text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_consume_check_in_token"(p_token); $w$;
revoke all on function public."portal_consume_check_in_token"(p_token text) from public;
revoke all on function internal."portal_consume_check_in_token"(p_token text) from public;
grant execute on function public."portal_consume_check_in_token"(p_token text) to service_role;
grant execute on function internal."portal_consume_check_in_token"(p_token text) to service_role;
grant execute on function public."portal_consume_check_in_token"(p_token text) to authenticated;
grant execute on function internal."portal_consume_check_in_token"(p_token text) to authenticated;
grant execute on function public."portal_consume_check_in_token"(p_token text) to anon;
grant execute on function internal."portal_consume_check_in_token"(p_token text) to anon;

-- --- portal_create_check_in_token(p_company_id uuid, p_booking_id uuid) ---
alter function public."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) set schema internal;
alter function internal."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) set search_path to internal, public;
create or replace function public."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_create_check_in_token"(p_company_id, p_booking_id); $w$;
revoke all on function public."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) from public;
revoke all on function internal."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) from public;
grant execute on function public."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) to service_role;
grant execute on function internal."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) to service_role;
grant execute on function public."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) to authenticated;
grant execute on function internal."portal_create_check_in_token"(p_company_id uuid, p_booking_id uuid) to authenticated;

-- --- portal_get_document_signed_url(p_document_id uuid) ---
alter function public."portal_get_document_signed_url"(p_document_id uuid) set schema internal;
alter function internal."portal_get_document_signed_url"(p_document_id uuid) set search_path to internal, public;
create or replace function public."portal_get_document_signed_url"(p_document_id uuid)
 returns text
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_get_document_signed_url"(p_document_id); $w$;
revoke all on function public."portal_get_document_signed_url"(p_document_id uuid) from public;
revoke all on function internal."portal_get_document_signed_url"(p_document_id uuid) from public;
grant execute on function public."portal_get_document_signed_url"(p_document_id uuid) to service_role;
grant execute on function internal."portal_get_document_signed_url"(p_document_id uuid) to service_role;
grant execute on function public."portal_get_document_signed_url"(p_document_id uuid) to authenticated;
grant execute on function internal."portal_get_document_signed_url"(p_document_id uuid) to authenticated;

-- --- portal_resolve_customer_by_phone(p_company_id uuid, p_phone text) ---
alter function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) set schema internal;
alter function internal."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) set search_path to internal, public;
create or replace function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_resolve_customer_by_phone"(p_company_id, p_phone); $w$;
revoke all on function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) from public;
revoke all on function internal."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) from public;
grant execute on function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to service_role;
grant execute on function internal."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to service_role;
grant execute on function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to authenticated;
grant execute on function internal."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to authenticated;
grant execute on function public."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to anon;
grant execute on function internal."portal_resolve_customer_by_phone"(p_company_id uuid, p_phone text) to anon;

-- --- portal_start_auth_challenge(p_company_id uuid, p_method text, p_destination text) ---
alter function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) set schema internal;
alter function internal."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) set search_path to internal, public;
create or replace function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_start_auth_challenge"(p_company_id, p_method, p_destination); $w$;
revoke all on function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) from public;
revoke all on function internal."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) from public;
grant execute on function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to service_role;
grant execute on function internal."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to service_role;
grant execute on function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to authenticated;
grant execute on function internal."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to authenticated;
grant execute on function public."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to anon;
grant execute on function internal."portal_start_auth_challenge"(p_company_id uuid, p_method text, p_destination text) to anon;

-- --- portal_upsert_customer(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) ---
alter function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) set schema internal;
alter function internal."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) set search_path to internal, public;
create or replace function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text DEFAULT 'en'::text, p_marketing_consent boolean DEFAULT false)
 returns uuid
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_upsert_customer"(p_company_id, p_name, p_email, p_phone, p_owner_user_id, p_preferred_language, p_marketing_consent); $w$;
revoke all on function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) from public;
revoke all on function internal."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) from public;
grant execute on function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to service_role;
grant execute on function internal."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to service_role;
grant execute on function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to authenticated;
grant execute on function internal."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to authenticated;
grant execute on function public."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to anon;
grant execute on function internal."portal_upsert_customer"(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean) to anon;

-- --- portal_verify_auth_challenge(p_challenge_id uuid, p_code text) ---
alter function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) set schema internal;
alter function internal."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) set search_path to internal, public;
create or replace function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."portal_verify_auth_challenge"(p_challenge_id, p_code); $w$;
revoke all on function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) from public;
revoke all on function internal."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) from public;
grant execute on function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to service_role;
grant execute on function internal."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to service_role;
grant execute on function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to authenticated;
grant execute on function internal."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to authenticated;
grant execute on function public."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to anon;
grant execute on function internal."portal_verify_auth_challenge"(p_challenge_id uuid, p_code text) to anon;

-- --- publish_automation_workflow_version(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) ---
alter function public."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) set schema internal;
alter function internal."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) set search_path to internal, public;
create or replace function public."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."publish_automation_workflow_version"(p_flow_id, p_company_id, p_release_notes, p_snapshot, p_published_by, p_flow_name, p_flow_description, p_flow_trigger_type, p_flow_metadata, p_updated_by); $w$;
revoke all on function public."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) from public;
revoke all on function internal."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) from public;
grant execute on function public."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) to service_role;
grant execute on function internal."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) to service_role;
grant execute on function public."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) to authenticated;
grant execute on function internal."publish_automation_workflow_version"(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) to authenticated;

-- --- record_subscription_renewal_failure_v1(p_company_id uuid, p_reason text) ---
alter function public."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) set schema internal;
alter function internal."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."record_subscription_renewal_failure_v1"(p_company_id, p_reason); $w$;
revoke all on function public."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) from public;
revoke all on function internal."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) from public;
grant execute on function public."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function internal."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function public."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) to authenticated;
grant execute on function internal."record_subscription_renewal_failure_v1"(p_company_id uuid, p_reason text) to authenticated;

-- --- reject_company_v1(p_company_id uuid, p_reason text) ---
alter function public."reject_company_v1"(p_company_id uuid, p_reason text) set schema internal;
alter function internal."reject_company_v1"(p_company_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."reject_company_v1"(p_company_id uuid, p_reason text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."reject_company_v1"(p_company_id, p_reason); $w$;
revoke all on function public."reject_company_v1"(p_company_id uuid, p_reason text) from public;
revoke all on function internal."reject_company_v1"(p_company_id uuid, p_reason text) from public;
grant execute on function public."reject_company_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function internal."reject_company_v1"(p_company_id uuid, p_reason text) to service_role;
grant execute on function public."reject_company_v1"(p_company_id uuid, p_reason text) to authenticated;
grant execute on function internal."reject_company_v1"(p_company_id uuid, p_reason text) to authenticated;

-- --- remove_company_employee(p_user_id uuid) ---
alter function public."remove_company_employee"(p_user_id uuid) set schema internal;
alter function internal."remove_company_employee"(p_user_id uuid) set search_path to internal, public;
create or replace function public."remove_company_employee"(p_user_id uuid)
 returns void
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select from internal."remove_company_employee"(p_user_id); $w$;
revoke all on function public."remove_company_employee"(p_user_id uuid) from public;
revoke all on function internal."remove_company_employee"(p_user_id uuid) from public;
grant execute on function public."remove_company_employee"(p_user_id uuid) to service_role;
grant execute on function internal."remove_company_employee"(p_user_id uuid) to service_role;
grant execute on function public."remove_company_employee"(p_user_id uuid) to authenticated;
grant execute on function internal."remove_company_employee"(p_user_id uuid) to authenticated;
comment on function public."remove_company_employee"(p_user_id uuid) is 'Removes an employee from their company: clears company, roles, branches, and deactivates.';

-- --- renew_subscription_from_payment(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) ---
alter function public."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) set schema internal;
alter function internal."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) set search_path to internal, public;
create or replace function public."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_payment_method_label text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_provider_payment_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_payment_method_code text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_amount_mode text DEFAULT 'manual'::text, p_expected_subscription_id uuid DEFAULT NULL::uuid, p_advance_period boolean DEFAULT true)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."renew_subscription_from_payment"(p_company_id, p_amount, p_currency, p_payment_method_label, p_provider, p_provider_payment_id, p_metadata, p_payment_method_code, p_idempotency_key, p_amount_mode, p_expected_subscription_id, p_advance_period); $w$;
revoke all on function public."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) from public;
revoke all on function internal."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) from public;
grant execute on function public."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) to service_role;
grant execute on function internal."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) to service_role;
grant execute on function public."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) to authenticated;
grant execute on function internal."renew_subscription_from_payment"(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) to authenticated;

-- --- repair_tenant_ai_bootstrap() ---
alter function public."repair_tenant_ai_bootstrap"() set schema internal;
alter function internal."repair_tenant_ai_bootstrap"() set search_path to internal, public;
create or replace function public."repair_tenant_ai_bootstrap"()
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."repair_tenant_ai_bootstrap"(); $w$;
revoke all on function public."repair_tenant_ai_bootstrap"() from public;
revoke all on function internal."repair_tenant_ai_bootstrap"() from public;
grant execute on function public."repair_tenant_ai_bootstrap"() to service_role;
grant execute on function internal."repair_tenant_ai_bootstrap"() to service_role;
grant execute on function public."repair_tenant_ai_bootstrap"() to authenticated;
grant execute on function internal."repair_tenant_ai_bootstrap"() to authenticated;

-- --- replace_user_role(p_user_id uuid, p_role_id uuid) ---
alter function public."replace_user_role"(p_user_id uuid, p_role_id uuid) set schema internal;
alter function internal."replace_user_role"(p_user_id uuid, p_role_id uuid) set search_path to internal, public;
create or replace function public."replace_user_role"(p_user_id uuid, p_role_id uuid)
 returns void
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select from internal."replace_user_role"(p_user_id, p_role_id); $w$;
revoke all on function public."replace_user_role"(p_user_id uuid, p_role_id uuid) from public;
revoke all on function internal."replace_user_role"(p_user_id uuid, p_role_id uuid) from public;
grant execute on function public."replace_user_role"(p_user_id uuid, p_role_id uuid) to service_role;
grant execute on function internal."replace_user_role"(p_user_id uuid, p_role_id uuid) to service_role;
grant execute on function public."replace_user_role"(p_user_id uuid, p_role_id uuid) to authenticated;
grant execute on function internal."replace_user_role"(p_user_id uuid, p_role_id uuid) to authenticated;
comment on function public."replace_user_role"(p_user_id uuid, p_role_id uuid) is 'Atomically replaces a user''s role assignments with a single tenant-local role. Runs DELETE+INSERT in one transaction so migration 124''s deferrable last-admin trigger evaluates the final state. Requires users.edit (or service_role).';

-- --- replace_user_roles(p_user_id uuid, p_role_ids uuid[]) ---
alter function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) set schema internal;
alter function internal."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) set search_path to internal, public;
create or replace function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[])
 returns void
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select from internal."replace_user_roles"(p_user_id, p_role_ids); $w$;
revoke all on function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) from public;
revoke all on function internal."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) from public;
grant execute on function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) to service_role;
grant execute on function internal."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) to service_role;
grant execute on function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) to authenticated;
grant execute on function internal."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) to authenticated;
comment on function public."replace_user_roles"(p_user_id uuid, p_role_ids uuid[]) is 'Atomically replaces all role assignments for a user. Empty array clears roles. Same transaction semantics as replace_user_role.';

-- --- require_company_feature_v1(p_company_id uuid, p_feature_code text) ---
alter function public."require_company_feature_v1"(p_company_id uuid, p_feature_code text) set schema internal;
alter function internal."require_company_feature_v1"(p_company_id uuid, p_feature_code text) set search_path to internal, public;
create or replace function public."require_company_feature_v1"(p_company_id uuid, p_feature_code text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."require_company_feature_v1"(p_company_id, p_feature_code); $w$;
revoke all on function public."require_company_feature_v1"(p_company_id uuid, p_feature_code text) from public;
revoke all on function internal."require_company_feature_v1"(p_company_id uuid, p_feature_code text) from public;
grant execute on function public."require_company_feature_v1"(p_company_id uuid, p_feature_code text) to service_role;
grant execute on function internal."require_company_feature_v1"(p_company_id uuid, p_feature_code text) to service_role;
grant execute on function public."require_company_feature_v1"(p_company_id uuid, p_feature_code text) to authenticated;
grant execute on function internal."require_company_feature_v1"(p_company_id uuid, p_feature_code text) to authenticated;

-- --- reset_enterprise_demo_v1() ---
alter function public."reset_enterprise_demo_v1"() set schema internal;
alter function internal."reset_enterprise_demo_v1"() set search_path to internal, public;
create or replace function public."reset_enterprise_demo_v1"()
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."reset_enterprise_demo_v1"(); $w$;
revoke all on function public."reset_enterprise_demo_v1"() from public;
revoke all on function internal."reset_enterprise_demo_v1"() from public;
grant execute on function public."reset_enterprise_demo_v1"() to service_role;
grant execute on function internal."reset_enterprise_demo_v1"() to service_role;
grant execute on function public."reset_enterprise_demo_v1"() to authenticated;
grant execute on function internal."reset_enterprise_demo_v1"() to authenticated;

-- --- resolve_billing_setting_integer(p_code text, p_company_id uuid) ---
alter function public."resolve_billing_setting_integer"(p_code text, p_company_id uuid) set schema internal;
alter function internal."resolve_billing_setting_integer"(p_code text, p_company_id uuid) set search_path to internal, public;
create or replace function public."resolve_billing_setting_integer"(p_code text, p_company_id uuid DEFAULT NULL::uuid)
 returns integer
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."resolve_billing_setting_integer"(p_code, p_company_id); $w$;
revoke all on function public."resolve_billing_setting_integer"(p_code text, p_company_id uuid) from public;
revoke all on function internal."resolve_billing_setting_integer"(p_code text, p_company_id uuid) from public;
grant execute on function public."resolve_billing_setting_integer"(p_code text, p_company_id uuid) to service_role;
grant execute on function internal."resolve_billing_setting_integer"(p_code text, p_company_id uuid) to service_role;
grant execute on function public."resolve_billing_setting_integer"(p_code text, p_company_id uuid) to authenticated;
grant execute on function internal."resolve_billing_setting_integer"(p_code text, p_company_id uuid) to authenticated;

-- --- restore_billing_subscription(p_company_id uuid, p_reason text) ---
alter function public."restore_billing_subscription"(p_company_id uuid, p_reason text) set schema internal;
alter function internal."restore_billing_subscription"(p_company_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."restore_billing_subscription"(p_company_id uuid, p_reason text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."restore_billing_subscription"(p_company_id, p_reason); $w$;
revoke all on function public."restore_billing_subscription"(p_company_id uuid, p_reason text) from public;
revoke all on function internal."restore_billing_subscription"(p_company_id uuid, p_reason text) from public;
grant execute on function public."restore_billing_subscription"(p_company_id uuid, p_reason text) to service_role;
grant execute on function internal."restore_billing_subscription"(p_company_id uuid, p_reason text) to service_role;
grant execute on function public."restore_billing_subscription"(p_company_id uuid, p_reason text) to authenticated;
grant execute on function internal."restore_billing_subscription"(p_company_id uuid, p_reason text) to authenticated;

-- --- retry_tenant_provisioning(p_company_id uuid) ---
alter function public."retry_tenant_provisioning"(p_company_id uuid) set schema internal;
alter function internal."retry_tenant_provisioning"(p_company_id uuid) set search_path to internal, public;
create or replace function public."retry_tenant_provisioning"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."retry_tenant_provisioning"(p_company_id); $w$;
revoke all on function public."retry_tenant_provisioning"(p_company_id uuid) from public;
revoke all on function internal."retry_tenant_provisioning"(p_company_id uuid) from public;
grant execute on function public."retry_tenant_provisioning"(p_company_id uuid) to service_role;
grant execute on function internal."retry_tenant_provisioning"(p_company_id uuid) to service_role;
grant execute on function public."retry_tenant_provisioning"(p_company_id uuid) to authenticated;
grant execute on function internal."retry_tenant_provisioning"(p_company_id uuid) to authenticated;

-- --- revoke_company_feature_grant(p_company_id uuid, p_feature_code text, p_notes text) ---
alter function public."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) set schema internal;
alter function internal."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) set search_path to internal, public;
create or replace function public."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text DEFAULT NULL::text)
 returns boolean
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."revoke_company_feature_grant"(p_company_id, p_feature_code, p_notes); $w$;
revoke all on function public."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) from public;
revoke all on function internal."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) from public;
grant execute on function public."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) to service_role;
grant execute on function internal."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) to service_role;
grant execute on function public."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) to authenticated;
grant execute on function internal."revoke_company_feature_grant"(p_company_id uuid, p_feature_code text, p_notes text) to authenticated;

-- --- run_subscription_lifecycle_enforcement_v1(p_limit integer) ---
alter function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer) set schema internal;
alter function internal."run_subscription_lifecycle_enforcement_v1"(p_limit integer) set search_path to internal, public;
create or replace function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer DEFAULT 100)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."run_subscription_lifecycle_enforcement_v1"(p_limit); $w$;
revoke all on function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer) from public;
revoke all on function internal."run_subscription_lifecycle_enforcement_v1"(p_limit integer) from public;
grant execute on function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer) to service_role;
grant execute on function internal."run_subscription_lifecycle_enforcement_v1"(p_limit integer) to service_role;
grant execute on function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer) to authenticated;
grant execute on function internal."run_subscription_lifecycle_enforcement_v1"(p_limit integer) to authenticated;
comment on function public."run_subscription_lifecycle_enforcement_v1"(p_limit integer) is 'Phase 7.8: bounded idempotent lifecycle enforcement (trial/period/grace). No payment capture or fabricated renewal.';

-- --- save_company_brand_center(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) ---
alter function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) set schema internal;
alter function internal."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) set search_path to internal, public;
create or replace function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text DEFAULT NULL::text, p_company_name text DEFAULT NULL::text, p_legal_name text DEFAULT NULL::text, p_support_email text DEFAULT NULL::text, p_support_phone text DEFAULT NULL::text, p_invoice_footer text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."save_company_brand_center"(p_company_id, p_branding, p_logo_url, p_company_name, p_legal_name, p_support_email, p_support_phone, p_invoice_footer); $w$;
revoke all on function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) from public;
revoke all on function internal."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) from public;
grant execute on function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) to service_role;
grant execute on function internal."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) to service_role;
grant execute on function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) to authenticated;
grant execute on function internal."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) to authenticated;
comment on function public."save_company_brand_center"(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) is 'Brand Center save: writes companies.branding and syncs logo/colors to billing, primary branch, portal.';

-- --- set_commercial_package_features_v1(p_plan_id uuid, p_feature_codes text[]) ---
alter function public."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) set schema internal;
alter function internal."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) set search_path to internal, public;
create or replace function public."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[])
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."set_commercial_package_features_v1"(p_plan_id, p_feature_codes); $w$;
revoke all on function public."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) from public;
revoke all on function internal."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) from public;
grant execute on function public."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) to service_role;
grant execute on function internal."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) to service_role;
grant execute on function public."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) to authenticated;
grant execute on function internal."set_commercial_package_features_v1"(p_plan_id uuid, p_feature_codes text[]) to authenticated;

-- --- set_company_feature_grant(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) ---
alter function public."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) set schema internal;
alter function internal."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) set search_path to internal, public;
create or replace function public."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text DEFAULT 'manual'::text, p_starts_at timestamp with time zone DEFAULT now(), p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 returns uuid
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."set_company_feature_grant"(p_company_id, p_feature_code, p_enabled, p_source, p_starts_at, p_expires_at, p_notes, p_reason); $w$;
revoke all on function public."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) from public;
revoke all on function internal."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) from public;
grant execute on function public."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) to service_role;
grant execute on function internal."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) to service_role;
grant execute on function public."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) to authenticated;
grant execute on function internal."set_company_feature_grant"(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) to authenticated;

-- --- suspend_billing_subscription(p_company_id uuid, p_reason text) ---
alter function public."suspend_billing_subscription"(p_company_id uuid, p_reason text) set schema internal;
alter function internal."suspend_billing_subscription"(p_company_id uuid, p_reason text) set search_path to internal, public;
create or replace function public."suspend_billing_subscription"(p_company_id uuid, p_reason text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."suspend_billing_subscription"(p_company_id, p_reason); $w$;
revoke all on function public."suspend_billing_subscription"(p_company_id uuid, p_reason text) from public;
revoke all on function internal."suspend_billing_subscription"(p_company_id uuid, p_reason text) from public;
grant execute on function public."suspend_billing_subscription"(p_company_id uuid, p_reason text) to service_role;
grant execute on function internal."suspend_billing_subscription"(p_company_id uuid, p_reason text) to service_role;
grant execute on function public."suspend_billing_subscription"(p_company_id uuid, p_reason text) to authenticated;
grant execute on function internal."suspend_billing_subscription"(p_company_id uuid, p_reason text) to authenticated;

-- --- switch_enterprise_demo_scenario_v1(p_scenario_code text) ---
alter function public."switch_enterprise_demo_scenario_v1"(p_scenario_code text) set schema internal;
alter function internal."switch_enterprise_demo_scenario_v1"(p_scenario_code text) set search_path to internal, public;
create or replace function public."switch_enterprise_demo_scenario_v1"(p_scenario_code text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."switch_enterprise_demo_scenario_v1"(p_scenario_code); $w$;
revoke all on function public."switch_enterprise_demo_scenario_v1"(p_scenario_code text) from public;
revoke all on function internal."switch_enterprise_demo_scenario_v1"(p_scenario_code text) from public;
grant execute on function public."switch_enterprise_demo_scenario_v1"(p_scenario_code text) to service_role;
grant execute on function internal."switch_enterprise_demo_scenario_v1"(p_scenario_code text) to service_role;
grant execute on function public."switch_enterprise_demo_scenario_v1"(p_scenario_code text) to authenticated;
grant execute on function internal."switch_enterprise_demo_scenario_v1"(p_scenario_code text) to authenticated;

-- --- sync_company_package_entitlements_v1(p_company_id uuid) ---
alter function public."sync_company_package_entitlements_v1"(p_company_id uuid) set schema internal;
alter function internal."sync_company_package_entitlements_v1"(p_company_id uuid) set search_path to internal, public;
create or replace function public."sync_company_package_entitlements_v1"(p_company_id uuid)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."sync_company_package_entitlements_v1"(p_company_id); $w$;
revoke all on function public."sync_company_package_entitlements_v1"(p_company_id uuid) from public;
revoke all on function internal."sync_company_package_entitlements_v1"(p_company_id uuid) from public;
grant execute on function public."sync_company_package_entitlements_v1"(p_company_id uuid) to service_role;
grant execute on function internal."sync_company_package_entitlements_v1"(p_company_id uuid) to service_role;
grant execute on function public."sync_company_package_entitlements_v1"(p_company_id uuid) to authenticated;
grant execute on function internal."sync_company_package_entitlements_v1"(p_company_id uuid) to authenticated;
comment on function public."sync_company_package_entitlements_v1"(p_company_id uuid) is 'Re-provisions source=package commercial grants from the company subscription plan. Repairs source=none when plan was assigned without package grant provisioning.';

-- --- update_billing_settings(p_scope_type text, p_company_id uuid, p_changes jsonb) ---
alter function public."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) set schema internal;
alter function internal."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) set search_path to internal, public;
create or replace function public."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."update_billing_settings"(p_scope_type, p_company_id, p_changes); $w$;
revoke all on function public."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) from public;
revoke all on function internal."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) from public;
grant execute on function public."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) to service_role;
grant execute on function internal."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) to service_role;
grant execute on function public."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) to authenticated;
grant execute on function internal."update_billing_settings"(p_scope_type text, p_company_id uuid, p_changes jsonb) to authenticated;

-- --- update_my_profile(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) ---
alter function public."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) set schema internal;
alter function internal."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) set search_path to internal, public;
create or replace function public."update_my_profile"(p_full_name text, p_avatar_url text DEFAULT NULL::text, p_preferred_language text DEFAULT 'en'::text, p_timezone text DEFAULT 'UTC'::text, p_preferred_theme text DEFAULT 'system'::text, p_job_title text DEFAULT NULL::text, p_department text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 returns profiles
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."update_my_profile"(p_full_name, p_avatar_url, p_preferred_language, p_timezone, p_preferred_theme, p_job_title, p_department, p_phone); $w$;
revoke all on function public."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) from public;
revoke all on function internal."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) from public;
grant execute on function public."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) to service_role;
grant execute on function internal."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) to service_role;
grant execute on function public."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) to authenticated;
grant execute on function internal."update_my_profile"(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) to authenticated;

-- --- upsert_billing_contact(p_company_id uuid, p_name text, p_email text, p_phone text) ---
alter function public."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) set schema internal;
alter function internal."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) set search_path to internal, public;
create or replace function public."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_billing_contact"(p_company_id, p_name, p_email, p_phone); $w$;
revoke all on function public."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) from public;
revoke all on function internal."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) from public;
grant execute on function public."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) to service_role;
grant execute on function internal."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) to service_role;
grant execute on function public."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) to authenticated;
grant execute on function internal."upsert_billing_contact"(p_company_id uuid, p_name text, p_email text, p_phone text) to authenticated;

-- --- upsert_commercial_package_v1(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) ---
alter function public."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) set schema internal;
alter function internal."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) set search_path to internal, public;
create or replace function public."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid DEFAULT NULL::uuid, p_display_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_price_monthly numeric DEFAULT 0, p_price_yearly numeric DEFAULT 0, p_is_active boolean DEFAULT true, p_is_highlighted boolean DEFAULT false, p_is_public boolean DEFAULT true, p_sort_order integer DEFAULT 0, p_tier_rank integer DEFAULT 0, p_metadata jsonb DEFAULT '{}'::jsonb, p_max_users integer DEFAULT NULL::integer, p_max_customers integer DEFAULT NULL::integer, p_storage_gb numeric DEFAULT NULL::numeric, p_ai_tokens_monthly bigint DEFAULT NULL::bigint, p_pricing_mode text DEFAULT NULL::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_commercial_package_v1"(p_code, p_name, p_id, p_display_name, p_description, p_price_monthly, p_price_yearly, p_is_active, p_is_highlighted, p_is_public, p_sort_order, p_tier_rank, p_metadata, p_max_users, p_max_customers, p_storage_gb, p_ai_tokens_monthly, p_pricing_mode); $w$;
revoke all on function public."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) from public;
revoke all on function internal."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) from public;
grant execute on function public."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) to service_role;
grant execute on function internal."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) to service_role;
grant execute on function public."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) to authenticated;
grant execute on function internal."upsert_commercial_package_v1"(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) to authenticated;

-- --- upsert_company_email_settings(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) ---
alter function public."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) set schema internal;
alter function internal."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) set search_path to internal, public;
create or replace function public."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer DEFAULT 3, p_conversation_enabled boolean DEFAULT false, p_inbound_provider text DEFAULT 'imap'::text, p_outbound_provider text DEFAULT 'smtp'::text, p_imap_host text DEFAULT ''::text, p_imap_port integer DEFAULT 993, p_imap_username text DEFAULT ''::text, p_imap_password text DEFAULT ''::text, p_imap_encryption text DEFAULT 'ssl'::text, p_reply_to_email text DEFAULT ''::text, p_max_attachment_bytes bigint DEFAULT 26214400, p_imap_mailbox text DEFAULT 'INBOX'::text, p_imap_poll_interval_seconds integer DEFAULT 60, p_oauth_provider text DEFAULT NULL::text, p_oauth_token text DEFAULT ''::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_company_email_settings"(p_company_id, p_enabled, p_smtp_host, p_smtp_port, p_smtp_username, p_smtp_password, p_smtp_encryption, p_from_email, p_from_name, p_max_retry_count, p_conversation_enabled, p_inbound_provider, p_outbound_provider, p_imap_host, p_imap_port, p_imap_username, p_imap_password, p_imap_encryption, p_reply_to_email, p_max_attachment_bytes, p_imap_mailbox, p_imap_poll_interval_seconds, p_oauth_provider, p_oauth_token); $w$;
revoke all on function public."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) from public;
revoke all on function internal."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) from public;
grant execute on function public."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) to service_role;
grant execute on function internal."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) to service_role;
grant execute on function public."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) to authenticated;
grant execute on function internal."upsert_company_email_settings"(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) to authenticated;

-- --- upsert_company_instagram_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) ---
alter function public."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) set schema internal;
alter function internal."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) set search_path to internal, public;
create or replace function public."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text DEFAULT 'v21.0'::text, p_app_secret text DEFAULT ''::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_company_instagram_settings"(p_company_id, p_enabled, p_provider, p_access_token, p_page_id, p_instagram_business_account_id, p_webhook_verify_token, p_api_version, p_app_secret); $w$;
revoke all on function public."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;
revoke all on function internal."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;
grant execute on function public."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to service_role;
grant execute on function internal."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to service_role;
grant execute on function public."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to authenticated;
grant execute on function internal."upsert_company_instagram_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to authenticated;

-- --- upsert_company_messenger_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) ---
alter function public."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) set schema internal;
alter function internal."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) set search_path to internal, public;
create or replace function public."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text DEFAULT 'v21.0'::text, p_app_secret text DEFAULT ''::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_company_messenger_settings"(p_company_id, p_enabled, p_provider, p_page_id, p_access_token, p_webhook_verify_token, p_api_version, p_app_secret); $w$;
revoke all on function public."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;
revoke all on function internal."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;
grant execute on function public."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to service_role;
grant execute on function internal."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to service_role;
grant execute on function public."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to authenticated;
grant execute on function internal."upsert_company_messenger_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) to authenticated;

-- --- upsert_company_whatsapp_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) ---
alter function public."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) set schema internal;
alter function internal."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) set search_path to internal, public;
create or replace function public."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer DEFAULT 3, p_api_version text DEFAULT 'v21.0'::text, p_app_secret text DEFAULT ''::text)
 returns jsonb
 language sql
 VOLATILE
 security invoker
 set search_path to public, internal
as $w$ select internal."upsert_company_whatsapp_settings"(p_company_id, p_enabled, p_provider, p_access_token, p_phone_number_id, p_business_account_id, p_webhook_verify_token, p_default_language, p_max_retry_count, p_api_version, p_app_secret); $w$;
revoke all on function public."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) from public;
revoke all on function internal."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) from public;
grant execute on function public."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) to service_role;
grant execute on function internal."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) to service_role;
grant execute on function public."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) to authenticated;
grant execute on function internal."upsert_company_whatsapp_settings"(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) to authenticated;

-- --- user_has_permission(p_code text) ---
alter function public."user_has_permission"(p_code text) set schema internal;
alter function internal."user_has_permission"(p_code text) set search_path to internal, public;
create or replace function public."user_has_permission"(p_code text)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."user_has_permission"(p_code); $w$;
revoke all on function public."user_has_permission"(p_code text) from public;
revoke all on function internal."user_has_permission"(p_code text) from public;
grant execute on function public."user_has_permission"(p_code text) to service_role;
grant execute on function internal."user_has_permission"(p_code text) to service_role;
grant execute on function public."user_has_permission"(p_code text) to authenticated;
grant execute on function internal."user_has_permission"(p_code text) to authenticated;
comment on function public."user_has_permission"(p_code text) is 'Tenant-scoped: role permissions apply only when role.company_id = current_company_id().';

-- --- whatsapp_settings_can_manage(p_company_id uuid) ---
alter function public."whatsapp_settings_can_manage"(p_company_id uuid) set schema internal;
alter function internal."whatsapp_settings_can_manage"(p_company_id uuid) set search_path to internal, public;
create or replace function public."whatsapp_settings_can_manage"(p_company_id uuid)
 returns boolean
 language sql
 STABLE
 security invoker
 set search_path to public, internal
as $w$ select internal."whatsapp_settings_can_manage"(p_company_id); $w$;
revoke all on function public."whatsapp_settings_can_manage"(p_company_id uuid) from public;
revoke all on function internal."whatsapp_settings_can_manage"(p_company_id uuid) from public;
grant execute on function public."whatsapp_settings_can_manage"(p_company_id uuid) to service_role;
grant execute on function internal."whatsapp_settings_can_manage"(p_company_id uuid) to service_role;
grant execute on function public."whatsapp_settings_can_manage"(p_company_id uuid) to authenticated;
grant execute on function internal."whatsapp_settings_can_manage"(p_company_id uuid) to authenticated;

