-- ============================================================
-- 283 — Phase 1B: revoke unintended anon EXECUTE on SECURITY DEFINER
--
-- Removes anonymous PostgREST/RPC exposure for 257 audited
-- SECURITY DEFINER functions while preserving the 5 intentional
-- customer-portal anonymous RPCs (OTP + booking + QR check-in).
--
-- For each revoke candidate:
--   REVOKE EXECUTE FROM anon
--   REVOKE EXECUTE FROM PUBLIC when PUBLIC currently has EXECUTE
--     (prevents anon inheriting EXECUTE via PUBLIC)
-- Does NOT newly grant authenticated/service_role (existing explicit
--   grants are already present where those roles currently execute).
-- Does NOT modify function bodies, triggers, or business logic.
-- ============================================================

-- ── KEEP (untouched): intentional anon portal RPCs ───────────
-- KEEP anon+authenticated: public.portal_consume_check_in_token(p_token text)
-- KEEP anon+authenticated: public.portal_resolve_customer_by_phone(p_company_id uuid, p_phone text)
-- KEEP anon+authenticated: public.portal_start_auth_challenge(p_company_id uuid, p_method text, p_destination text)
-- KEEP anon+authenticated: public.portal_upsert_customer(p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean)
-- KEEP anon+authenticated: public.portal_verify_auth_challenge(p_challenge_id uuid, p_code text)

-- ── REVOKE: 257 audited functions (exact live signatures) ───

-- public._apply_company_onboarding_identity(p_company_id uuid, p_payload jsonb)
revoke execute on function public._apply_company_onboarding_identity(p_company_id uuid, p_payload jsonb) from anon;

-- public._apply_configured_trial_feature_grants(p_company_id uuid, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_grant_source text)
revoke execute on function public._apply_configured_trial_feature_grants(p_company_id uuid, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_grant_source text) from anon;

-- public._apply_demo_scenario_v1(p_scenario text)
revoke execute on function public._apply_demo_scenario_v1(p_scenario text) from anon;
revoke execute on function public._apply_demo_scenario_v1(p_scenario text) from public;

-- public._assert_lifecycle_enforcement_caller()
revoke execute on function public._assert_lifecycle_enforcement_caller() from anon;

-- public._billing_payment_settlement_result_v1(p_payment_id uuid)
revoke execute on function public._billing_payment_settlement_result_v1(p_payment_id uuid) from anon;

-- public._can_manage_commercial_packages()
revoke execute on function public._can_manage_commercial_packages() from anon;

-- public._company_subscriptions_status_transition_guard()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public._company_subscriptions_status_transition_guard() from anon;
revoke execute on function public._company_subscriptions_status_transition_guard() from public;

-- public._demo_auth_user(p_user_id uuid, p_email text, p_full_name text, p_password text)
revoke execute on function public._demo_auth_user(p_user_id uuid, p_email text, p_full_name text, p_password text) from anon;
revoke execute on function public._demo_auth_user(p_user_id uuid, p_email text, p_full_name text, p_password text) from public;

-- public._demo_register(p_table text, p_id uuid)
revoke execute on function public._demo_register(p_table text, p_id uuid) from anon;
revoke execute on function public._demo_register(p_table text, p_id uuid) from public;

-- public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid)
revoke execute on function public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid) from anon;
revoke execute on function public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid) from public;

-- public._demo_set_triggers(enabled boolean)
revoke execute on function public._demo_set_triggers(enabled boolean) from anon;
revoke execute on function public._demo_set_triggers(enabled boolean) from public;

-- public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid)
revoke execute on function public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid) from anon;
revoke execute on function public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid) from public;

-- public._ensure_company_subscription_row(p_company_id uuid, p_start_trial boolean, p_billing_cycle text, p_plan_id uuid)
revoke execute on function public._ensure_company_subscription_row(p_company_id uuid, p_start_trial boolean, p_billing_cycle text, p_plan_id uuid) from anon;

-- public._ensure_core_system_feature_grants(p_company_id uuid)
revoke execute on function public._ensure_core_system_feature_grants(p_company_id uuid) from anon;

-- public._package_feature_codes(p_plan_id uuid)
revoke execute on function public._package_feature_codes(p_plan_id uuid) from anon;

-- public._resolve_default_onboarding_plan_id()
revoke execute on function public._resolve_default_onboarding_plan_id() from anon;

-- public._set_company_feature_grant_internal(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text)
revoke execute on function public._set_company_feature_grant_internal(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) from anon;

-- public._sync_company_package_entitlements_internal(p_company_id uuid)
revoke execute on function public._sync_company_package_entitlements_internal(p_company_id uuid) from anon;

-- public.appointment_platform_company_metrics_v1(p_company_id uuid, p_period_start timestamp with time zone)
revoke execute on function public.appointment_platform_company_metrics_v1(p_company_id uuid, p_period_start timestamp with time zone) from anon;
revoke execute on function public.appointment_platform_company_metrics_v1(p_company_id uuid, p_period_start timestamp with time zone) from public;

-- public.approve_company_v1(p_company_id uuid, p_mode text, p_notes text)
revoke execute on function public.approve_company_v1(p_company_id uuid, p_mode text, p_notes text) from anon;

-- public.assert_tenant_retains_active_company_admin(p_company_id uuid)
revoke execute on function public.assert_tenant_retains_active_company_admin(p_company_id uuid) from anon;
revoke execute on function public.assert_tenant_retains_active_company_admin(p_company_id uuid) from public;

-- public.assert_trusted_provisioning_caller()
revoke execute on function public.assert_trusted_provisioning_caller() from anon;

-- public.assign_company_package_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text)
revoke execute on function public.assign_company_package_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from anon;

-- public.assign_conversation_number()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.assign_conversation_number() from anon;

-- public.assign_scheduling_booking_confirmation_number()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.assign_scheduling_booking_confirmation_number() from anon;

-- public.assign_subscription_plan(p_company_id uuid, p_plan_id uuid, p_billing_cycle text)
revoke execute on function public.assign_subscription_plan(p_company_id uuid, p_plan_id uuid, p_billing_cycle text) from anon;

-- public.attach_billing_checkout_provider_v1(p_session_id uuid, p_provider_session_id text, p_checkout_url text, p_provider_code text, p_metadata jsonb)
revoke execute on function public.attach_billing_checkout_provider_v1(p_session_id uuid, p_provider_session_id text, p_checkout_url text, p_provider_code text, p_metadata jsonb) from anon;

-- public.audit_tenant_duplicate_admin_roles()
revoke execute on function public.audit_tenant_duplicate_admin_roles() from anon;

-- public.billing_notification_in_app_subscriber()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.billing_notification_in_app_subscriber() from anon;
revoke execute on function public.billing_notification_in_app_subscriber() from public;

-- public.build_billing_company_snapshot(p_company_id uuid)
revoke execute on function public.build_billing_company_snapshot(p_company_id uuid) from anon;

-- public.build_billing_contact_snapshot(p_company_id uuid)
revoke execute on function public.build_billing_contact_snapshot(p_company_id uuid) from anon;

-- public.can_access_workspace()
revoke execute on function public.can_access_workspace() from anon;

-- public.can_edit_billing()
revoke execute on function public.can_edit_billing() from anon;

-- public.can_edit_billing_settings(p_scope_type text, p_company_id uuid)
revoke execute on function public.can_edit_billing_settings(p_scope_type text, p_company_id uuid) from anon;

-- public.can_export_billing_audit()
revoke execute on function public.can_export_billing_audit() from anon;

-- public.can_manage_own_billing()
revoke execute on function public.can_manage_own_billing() from anon;

-- public.can_record_billing_payment()
revoke execute on function public.can_record_billing_payment() from anon;

-- public.can_view_billing_audit(p_company_id uuid)
revoke execute on function public.can_view_billing_audit(p_company_id uuid) from anon;

-- public.can_view_billing_company(p_company_id uuid)
revoke execute on function public.can_view_billing_company(p_company_id uuid) from anon;

-- public.can_view_billing_settings(p_scope_type text, p_company_id uuid)
revoke execute on function public.can_view_billing_settings(p_scope_type text, p_company_id uuid) from anon;

-- public.can_view_own_billing()
revoke execute on function public.can_view_own_billing() from anon;

-- public.cancel_company_subscription_v1(p_company_id uuid, p_reason text, p_at_period_end boolean)
revoke execute on function public.cancel_company_subscription_v1(p_company_id uuid, p_reason text, p_at_period_end boolean) from anon;

-- public.cancel_embedding_job(p_job_id uuid)
revoke execute on function public.cancel_embedding_job(p_job_id uuid) from anon;
revoke execute on function public.cancel_embedding_job(p_job_id uuid) from public;

-- public.change_company_package_v1(p_company_id uuid, p_plan_id uuid, p_reason text)
revoke execute on function public.change_company_package_v1(p_company_id uuid, p_plan_id uuid, p_reason text) from anon;

-- public.claim_embedding_jobs(p_company_id uuid, p_limit integer, p_worker_id text)
revoke execute on function public.claim_embedding_jobs(p_company_id uuid, p_limit integer, p_worker_id text) from anon;
revoke execute on function public.claim_embedding_jobs(p_company_id uuid, p_limit integer, p_worker_id text) from public;

-- public.company_has_agents_access(p_company_id uuid, p_permission text)
revoke execute on function public.company_has_agents_access(p_company_id uuid, p_permission text) from anon;
revoke execute on function public.company_has_agents_access(p_company_id uuid, p_permission text) from public;

-- public.company_has_permission(p_company_id uuid, p_permission text)
revoke execute on function public.company_has_permission(p_company_id uuid, p_permission text) from anon;
revoke execute on function public.company_has_permission(p_company_id uuid, p_permission text) from public;

-- public.company_id_for_user(p_user_id uuid)
revoke execute on function public.company_id_for_user(p_user_id uuid) from anon;
revoke execute on function public.company_id_for_user(p_user_id uuid) from public;

-- public.conversation_audit_company_id(p_conversation_id uuid)
revoke execute on function public.conversation_audit_company_id(p_conversation_id uuid) from anon;
revoke execute on function public.conversation_audit_company_id(p_conversation_id uuid) from public;

-- public.conversation_belongs_to_current_company(p_conversation_id uuid)
revoke execute on function public.conversation_belongs_to_current_company(p_conversation_id uuid) from anon;
revoke execute on function public.conversation_belongs_to_current_company(p_conversation_id uuid) from public;

-- public.convert_trial_to_paid_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text)
revoke execute on function public.convert_trial_to_paid_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_reason text, p_conversion_source text) from anon;

-- public.count_active_company_admin_assignees(p_company_id uuid)
revoke execute on function public.count_active_company_admin_assignees(p_company_id uuid) from anon;
revoke execute on function public.count_active_company_admin_assignees(p_company_id uuid) from public;

-- public.create_billing_checkout_session_v1(p_return_url text, p_cancel_url text, p_idempotency_key text, p_company_id uuid, p_provider_code text)
revoke execute on function public.create_billing_checkout_session_v1(p_return_url text, p_cancel_url text, p_idempotency_key text, p_company_id uuid, p_provider_code text) from anon;

-- public.create_company_admin_v1(p_payload jsonb)
revoke execute on function public.create_company_admin_v1(p_payload jsonb) from anon;

-- public.create_company_subscription_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_start_trial boolean)
revoke execute on function public.create_company_subscription_v1(p_company_id uuid, p_plan_id uuid, p_billing_cycle text, p_start_trial boolean) from anon;

-- public.create_company_v1(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text)
revoke execute on function public.create_company_v1(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) from anon;
revoke execute on function public.create_company_v1(p_name text, p_status text, p_subscription_plan text, p_subscription_expires_at timestamp with time zone, p_logo_url text) from public;

-- public.crm_same_company(p_owner_user_id uuid)
revoke execute on function public.crm_same_company(p_owner_user_id uuid) from anon;
revoke execute on function public.crm_same_company(p_owner_user_id uuid) from public;

-- public.current_company_id()
revoke execute on function public.current_company_id() from anon;
revoke execute on function public.current_company_id() from public;

-- public.emit_subscription_event(p_company_id uuid, p_subscription_id uuid, p_event_type text, p_title text, p_description text, p_metadata jsonb, p_occurred_at timestamp with time zone)
revoke execute on function public.emit_subscription_event(p_company_id uuid, p_subscription_id uuid, p_event_type text, p_title text, p_description text, p_metadata jsonb, p_occurred_at timestamp with time zone) from anon;

-- public.enforce_active_period_due_v1(p_limit integer)
revoke execute on function public.enforce_active_period_due_v1(p_limit integer) from anon;

-- public.enforce_grace_period_expirations_v1(p_limit integer)
revoke execute on function public.enforce_grace_period_expirations_v1(p_limit integer) from anon;

-- public.enforce_past_due_to_grace_v1(p_limit integer)
revoke execute on function public.enforce_past_due_to_grace_v1(p_limit integer) from anon;

-- public.enforce_trial_expirations_v1(p_limit integer)
revoke execute on function public.enforce_trial_expirations_v1(p_limit integer) from anon;

-- public.execute_tenant_provisioning(p_company_id uuid)
revoke execute on function public.execute_tenant_provisioning(p_company_id uuid) from anon;

-- public.executive_record_access(p_company_id uuid, p_section text, p_metadata jsonb)
revoke execute on function public.executive_record_access(p_company_id uuid, p_section text, p_metadata jsonb) from anon;
revoke execute on function public.executive_record_access(p_company_id uuid, p_section text, p_metadata jsonb) from public;

-- public.extend_company_trial_v1(p_company_id uuid, p_new_ends_at timestamp with time zone)
revoke execute on function public.extend_company_trial_v1(p_company_id uuid, p_new_ends_at timestamp with time zone) from anon;

-- public.financial_append_ledger(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid)
revoke execute on function public.financial_append_ledger(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) from anon;
revoke execute on function public.financial_append_ledger(p_company_id uuid, p_entry_type text, p_direction text, p_amount_cents bigint, p_currency text, p_reference_type text, p_reference_id uuid, p_description text, p_metadata jsonb, p_created_by uuid) from public;

-- public.financial_compute_analytics_snapshot_v1(p_snapshot_date date)
revoke execute on function public.financial_compute_analytics_snapshot_v1(p_snapshot_date date) from anon;

-- public.financial_next_invoice_number(p_company_id uuid)
revoke execute on function public.financial_next_invoice_number(p_company_id uuid) from anon;
revoke execute on function public.financial_next_invoice_number(p_company_id uuid) from public;

-- public.format_billing_document_number(p_document_type text, p_company_id uuid)
revoke execute on function public.format_billing_document_number(p_document_type text, p_company_id uuid) from anon;

-- public.generate_support_ticket_number(p_company_id uuid)
revoke execute on function public.generate_support_ticket_number(p_company_id uuid) from anon;
revoke execute on function public.generate_support_ticket_number(p_company_id uuid) from public;

-- public.get_assignable_roles(p_company_id uuid)
revoke execute on function public.get_assignable_roles(p_company_id uuid) from anon;

-- public.get_billing_payment_options_v1(p_company_id uuid)
revoke execute on function public.get_billing_payment_options_v1(p_company_id uuid) from anon;

-- public.get_billing_revenue_metrics_v1()
revoke execute on function public.get_billing_revenue_metrics_v1() from anon;

-- public.get_billing_setting(p_code text, p_company_id uuid)
revoke execute on function public.get_billing_setting(p_code text, p_company_id uuid) from anon;

-- public.get_billing_settings_by_category(p_category text, p_scope_type text, p_company_id uuid)
revoke execute on function public.get_billing_settings_by_category(p_category text, p_scope_type text, p_company_id uuid) from anon;

-- public.get_company_access_state(p_company_id uuid)
revoke execute on function public.get_company_access_state(p_company_id uuid) from anon;

-- public.get_company_email_settings(p_company_id uuid)
revoke execute on function public.get_company_email_settings(p_company_id uuid) from anon;
revoke execute on function public.get_company_email_settings(p_company_id uuid) from public;

-- public.get_company_email_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_email_settings_decrypted(p_company_id uuid) from anon;
revoke execute on function public.get_company_email_settings_decrypted(p_company_id uuid) from public;

-- public.get_company_entitlements(p_company_id uuid)
revoke execute on function public.get_company_entitlements(p_company_id uuid) from anon;

-- public.get_company_instagram_settings(p_company_id uuid)
revoke execute on function public.get_company_instagram_settings(p_company_id uuid) from anon;
revoke execute on function public.get_company_instagram_settings(p_company_id uuid) from public;

-- public.get_company_instagram_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_instagram_settings_decrypted(p_company_id uuid) from anon;
revoke execute on function public.get_company_instagram_settings_decrypted(p_company_id uuid) from public;

-- public.get_company_messenger_settings(p_company_id uuid)
revoke execute on function public.get_company_messenger_settings(p_company_id uuid) from anon;
revoke execute on function public.get_company_messenger_settings(p_company_id uuid) from public;

-- public.get_company_messenger_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_messenger_settings_decrypted(p_company_id uuid) from anon;
revoke execute on function public.get_company_messenger_settings_decrypted(p_company_id uuid) from public;

-- public.get_company_whatsapp_settings(p_company_id uuid)
revoke execute on function public.get_company_whatsapp_settings(p_company_id uuid) from anon;
revoke execute on function public.get_company_whatsapp_settings(p_company_id uuid) from public;

-- public.get_company_whatsapp_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_whatsapp_settings_decrypted(p_company_id uuid) from anon;
revoke execute on function public.get_company_whatsapp_settings_decrypted(p_company_id uuid) from public;

-- public.get_enterprise_demo_status_v1()
revoke execute on function public.get_enterprise_demo_status_v1() from anon;

-- public.get_payment_provider_health_v1()
revoke execute on function public.get_payment_provider_health_v1() from anon;

-- public.get_user_company_id()
revoke execute on function public.get_user_company_id() from anon;
revoke execute on function public.get_user_company_id() from public;

-- public.get_workspace_billing_summary_v1()
revoke execute on function public.get_workspace_billing_summary_v1() from anon;

-- public.handle_new_user()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from public;

-- public.ingest_usage_event(p_company_id uuid, p_metric_code text, p_quantity numeric, p_metadata jsonb, p_idempotency_key text, p_recorded_at timestamp with time zone, p_source text, p_reference_type text, p_reference_id text)
revoke execute on function public.ingest_usage_event(p_company_id uuid, p_metric_code text, p_quantity numeric, p_metadata jsonb, p_idempotency_key text, p_recorded_at timestamp with time zone, p_source text, p_reference_type text, p_reference_id text) from anon;

-- public.insert_notification(p_company_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_category text)
revoke execute on function public.insert_notification(p_company_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_category text) from anon;
revoke execute on function public.insert_notification(p_company_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_category text) from public;

-- public.integration_record_api_key_usage(p_key_id uuid)
revoke execute on function public.integration_record_api_key_usage(p_key_id uuid) from anon;
revoke execute on function public.integration_record_api_key_usage(p_key_id uuid) from public;

-- public.integration_retry_dead_letter(p_company_id uuid, p_limit integer)
revoke execute on function public.integration_retry_dead_letter(p_company_id uuid, p_limit integer) from anon;
revoke execute on function public.integration_retry_dead_letter(p_company_id uuid, p_limit integer) from public;

-- public.integration_validate_api_key(p_key_hash text)
revoke execute on function public.integration_validate_api_key(p_key_hash text) from anon;
revoke execute on function public.integration_validate_api_key(p_key_hash text) from public;

-- public.is_company_admin()
revoke execute on function public.is_company_admin() from anon;
revoke execute on function public.is_company_admin() from public;

-- public.is_company_admin_role(p_role_id uuid)
revoke execute on function public.is_company_admin_role(p_role_id uuid) from anon;
revoke execute on function public.is_company_admin_role(p_role_id uuid) from public;

-- public.is_company_commercially_expired(p_company_id uuid)
revoke execute on function public.is_company_commercially_expired(p_company_id uuid) from anon;

-- public.is_feature_commercially_gated(p_feature_code text)
revoke execute on function public.is_feature_commercially_gated(p_feature_code text) from anon;

-- public.is_feature_enabled(p_company_id uuid, p_feature_code text)
revoke execute on function public.is_feature_enabled(p_company_id uuid, p_feature_code text) from anon;

-- public.is_platform_billing_operator()
revoke execute on function public.is_platform_billing_operator() from anon;

-- public.is_super_admin()
revoke execute on function public.is_super_admin() from anon;
revoke execute on function public.is_super_admin() from public;

-- public.knowledge_keyword_search(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[])
revoke execute on function public.knowledge_keyword_search(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) from anon;
revoke execute on function public.knowledge_keyword_search(p_company_id uuid, p_query text, p_limit integer, p_source_ids uuid[], p_document_ids uuid[]) from public;

-- public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text)
revoke execute on function public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text) from anon;

-- public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean)
revoke execute on function public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean) from anon;

-- public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid)
revoke execute on function public.list_billing_audit_logs_paged(p_limit integer, p_offset integer, p_search text, p_event_type text, p_for_export boolean, p_company_id uuid) from anon;

-- public.list_billing_invoices_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text)
revoke execute on function public.list_billing_invoices_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text) from anon;

-- public.list_billing_payment_failures_paged_v1(p_limit integer, p_offset integer, p_search text)
revoke execute on function public.list_billing_payment_failures_paged_v1(p_limit integer, p_offset integer, p_search text) from anon;

-- public.list_billing_payments_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text)
revoke execute on function public.list_billing_payments_paged_v1(p_limit integer, p_offset integer, p_search text, p_status text) from anon;

-- public.list_billing_receipts_paged_v1(p_limit integer, p_offset integer, p_search text)
revoke execute on function public.list_billing_receipts_paged_v1(p_limit integer, p_offset integer, p_search text) from anon;

-- public.list_company_employee_auth_meta(p_company_id uuid)
revoke execute on function public.list_company_employee_auth_meta(p_company_id uuid) from anon;

-- public.list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text)
revoke execute on function public.list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text) from anon;

-- public.list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text)
revoke execute on function public.list_company_subscriptions_paged(p_limit integer, p_offset integer, p_search text, p_status text, p_billing_cycle text, p_sort_by text, p_sort_dir text) from anon;

-- public.list_enterprise_demo_scenarios_v1()
revoke execute on function public.list_enterprise_demo_scenarios_v1() from anon;

-- public.list_expiring_subscriptions_paged_v1(p_limit integer, p_offset integer)
revoke execute on function public.list_expiring_subscriptions_paged_v1(p_limit integer, p_offset integer) from anon;

-- public.list_upcoming_renewals_paged_v1(p_limit integer, p_offset integer, p_days integer)
revoke execute on function public.list_upcoming_renewals_paged_v1(p_limit integer, p_offset integer, p_days integer) from anon;

-- public.load_user_auth_context(p_user_id uuid)
revoke execute on function public.load_user_auth_context(p_user_id uuid) from anon;

-- public.mark_subscription_past_due_v1(p_company_id uuid, p_reason text)
revoke execute on function public.mark_subscription_past_due_v1(p_company_id uuid, p_reason text) from anon;

-- public.notification_bus_emit_v1(p_event_code text, p_company_id uuid, p_user_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text)
revoke execute on function public.notification_bus_emit_v1(p_event_code text, p_company_id uuid, p_user_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) from anon;

-- public.notification_bus_publish_v1(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text)
revoke execute on function public.notification_bus_publish_v1(p_event_code text, p_company_id uuid, p_payload jsonb, p_channels text[], p_idempotency_key text) from anon;

-- public.notify_audit_events()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_audit_events() from anon;
revoke execute on function public.notify_audit_events() from public;

-- public.notify_booking_changes()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_booking_changes() from anon;
revoke execute on function public.notify_booking_changes() from public;

-- public.notify_company_whatsapp_credential_admins(p_company_id uuid, p_title text, p_message text, p_min_interval_seconds integer)
revoke execute on function public.notify_company_whatsapp_credential_admins(p_company_id uuid, p_title text, p_message text, p_min_interval_seconds integer) from anon;
revoke execute on function public.notify_company_whatsapp_credential_admins(p_company_id uuid, p_title text, p_message text, p_min_interval_seconds integer) from public;

-- public.notify_customer_created()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_customer_created() from anon;
revoke execute on function public.notify_customer_created() from public;

-- public.notify_external_event(p_company_id uuid, p_user_id uuid, p_event text, p_message text)
revoke execute on function public.notify_external_event(p_company_id uuid, p_user_id uuid, p_event text, p_message text) from anon;
revoke execute on function public.notify_external_event(p_company_id uuid, p_user_id uuid, p_event text, p_message text) from public;

-- public.notify_invoice_changes()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_invoice_changes() from anon;
revoke execute on function public.notify_invoice_changes() from public;

-- public.notify_profile_events()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_profile_events() from anon;
revoke execute on function public.notify_profile_events() from public;

-- public.notify_role_events()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_role_events() from anon;
revoke execute on function public.notify_role_events() from public;

-- public.notify_role_updated()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_role_updated() from anon;
revoke execute on function public.notify_role_updated() from public;

-- public.notify_subscription_events()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.notify_subscription_events() from anon;
revoke execute on function public.notify_subscription_events() from public;

-- public.onboard_own_company_v1(p_payload jsonb)
revoke execute on function public.onboard_own_company_v1(p_payload jsonb) from anon;

-- public.organization_merge_departments(p_source_id uuid, p_target_id uuid)
revoke execute on function public.organization_merge_departments(p_source_id uuid, p_target_id uuid) from anon;

-- public.organization_resolve_policy(p_company_id uuid, p_branch_id uuid, p_policy_type text)
revoke execute on function public.organization_resolve_policy(p_company_id uuid, p_branch_id uuid, p_policy_type text) from anon;
revoke execute on function public.organization_resolve_policy(p_company_id uuid, p_branch_id uuid, p_policy_type text) from public;

-- public.organization_search(p_company_id uuid, p_query text, p_limit integer)
revoke execute on function public.organization_search(p_company_id uuid, p_query text, p_limit integer) from anon;
revoke execute on function public.organization_search(p_company_id uuid, p_query text, p_limit integer) from public;

-- public.pgvector_collection_statistics(p_company_id uuid, p_collection_name text)
revoke execute on function public.pgvector_collection_statistics(p_company_id uuid, p_collection_name text) from anon;
revoke execute on function public.pgvector_collection_statistics(p_company_id uuid, p_collection_name text) from public;

-- public.pgvector_create_collection(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb)
revoke execute on function public.pgvector_create_collection(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) from anon;
revoke execute on function public.pgvector_create_collection(p_company_id uuid, p_collection_name text, p_dimensions integer, p_metadata jsonb) from public;

-- public.pgvector_delete_collection(p_company_id uuid, p_collection_name text)
revoke execute on function public.pgvector_delete_collection(p_company_id uuid, p_collection_name text) from anon;
revoke execute on function public.pgvector_delete_collection(p_company_id uuid, p_collection_name text) from public;

-- public.pgvector_delete_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid)
revoke execute on function public.pgvector_delete_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid) from anon;
revoke execute on function public.pgvector_delete_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid) from public;

-- public.pgvector_similarity_search(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb)
revoke execute on function public.pgvector_similarity_search(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) from anon;
revoke execute on function public.pgvector_similarity_search(p_company_id uuid, p_collection_name text, p_query_vector double precision[], p_top_k integer, p_metadata_filter jsonb) from public;

-- public.pgvector_upsert_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb)
revoke execute on function public.pgvector_upsert_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) from anon;
revoke execute on function public.pgvector_upsert_vector(p_company_id uuid, p_collection_name text, p_vector_id uuid, p_vector double precision[], p_metadata jsonb) from public;

-- public.platform_ai_crypto_secret()
revoke execute on function public.platform_ai_crypto_secret() from anon;
revoke execute on function public.platform_ai_crypto_secret() from public;

-- public.platform_ai_decrypt_key(p_encrypted bytea)
revoke execute on function public.platform_ai_decrypt_key(p_encrypted bytea) from anon;
revoke execute on function public.platform_ai_decrypt_key(p_encrypted bytea) from public;

-- public.platform_ai_encrypt_key(p_plaintext text)
revoke execute on function public.platform_ai_encrypt_key(p_plaintext text) from anon;
revoke execute on function public.platform_ai_encrypt_key(p_plaintext text) from public;

-- public.platform_ai_feature_enabled(p_company_id uuid, p_feature_key text)
revoke execute on function public.platform_ai_feature_enabled(p_company_id uuid, p_feature_key text) from anon;
revoke execute on function public.platform_ai_feature_enabled(p_company_id uuid, p_feature_key text) from public;

-- public.platform_ai_ops_admin_audit(p_limit integer)
revoke execute on function public.platform_ai_ops_admin_audit(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_admin_audit(p_limit integer) from public;

-- public.platform_ai_ops_agent_workflows(p_limit integer)
revoke execute on function public.platform_ai_ops_agent_workflows(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_agent_workflows(p_limit integer) from public;

-- public.platform_ai_ops_assert_super_admin()
revoke execute on function public.platform_ai_ops_assert_super_admin() from anon;
revoke execute on function public.platform_ai_ops_assert_super_admin() from public;

-- public.platform_ai_ops_cost_by_company(p_limit integer)
revoke execute on function public.platform_ai_ops_cost_by_company(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_cost_by_company(p_limit integer) from public;

-- public.platform_ai_ops_cost_trends(p_days integer)
revoke execute on function public.platform_ai_ops_cost_trends(p_days integer) from anon;
revoke execute on function public.platform_ai_ops_cost_trends(p_days integer) from public;

-- public.platform_ai_ops_crm_agent_summary()
revoke execute on function public.platform_ai_ops_crm_agent_summary() from anon;
revoke execute on function public.platform_ai_ops_crm_agent_summary() from public;

-- public.platform_ai_ops_embedding_jobs(p_limit integer)
revoke execute on function public.platform_ai_ops_embedding_jobs(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_embedding_jobs(p_limit integer) from public;

-- public.platform_ai_ops_error_groups(p_limit integer)
revoke execute on function public.platform_ai_ops_error_groups(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_error_groups(p_limit integer) from public;

-- public.platform_ai_ops_evaluate_alerts()
revoke execute on function public.platform_ai_ops_evaluate_alerts() from anon;
revoke execute on function public.platform_ai_ops_evaluate_alerts() from public;

-- public.platform_ai_ops_feature_matrix()
revoke execute on function public.platform_ai_ops_feature_matrix() from anon;
revoke execute on function public.platform_ai_ops_feature_matrix() from public;

-- public.platform_ai_ops_knowledge_documents(p_limit integer)
revoke execute on function public.platform_ai_ops_knowledge_documents(p_limit integer) from anon;
revoke execute on function public.platform_ai_ops_knowledge_documents(p_limit integer) from public;

-- public.platform_ai_ops_knowledge_summary()
revoke execute on function public.platform_ai_ops_knowledge_summary() from anon;
revoke execute on function public.platform_ai_ops_knowledge_summary() from public;

-- public.platform_ai_ops_kpi_summary()
revoke execute on function public.platform_ai_ops_kpi_summary() from anon;
revoke execute on function public.platform_ai_ops_kpi_summary() from public;

-- public.platform_ai_ops_provider_health(p_provider_key text)
revoke execute on function public.platform_ai_ops_provider_health(p_provider_key text) from anon;
revoke execute on function public.platform_ai_ops_provider_health(p_provider_key text) from public;

-- public.platform_ai_ops_request_feed(p_limit integer, p_offset integer, p_search text)
revoke execute on function public.platform_ai_ops_request_feed(p_limit integer, p_offset integer, p_search text) from anon;
revoke execute on function public.platform_ai_ops_request_feed(p_limit integer, p_offset integer, p_search text) from public;

-- public.platform_ai_ops_tool_stats()
revoke execute on function public.platform_ai_ops_tool_stats() from anon;
revoke execute on function public.platform_ai_ops_tool_stats() from public;

-- public.platform_ai_store_crypto_secret(p_secret text)
revoke execute on function public.platform_ai_store_crypto_secret(p_secret text) from anon;
revoke execute on function public.platform_ai_store_crypto_secret(p_secret text) from public;

-- public.platform_health_check_v1()
revoke execute on function public.platform_health_check_v1() from anon;
revoke execute on function public.platform_health_check_v1() from public;

-- public.platform_resolve_ai_runtime_config(p_company_id uuid, p_provider_key text, p_use_case text)
revoke execute on function public.platform_resolve_ai_runtime_config(p_company_id uuid, p_provider_key text, p_use_case text) from anon;
revoke execute on function public.platform_resolve_ai_runtime_config(p_company_id uuid, p_provider_key text, p_use_case text) from public;

-- public.plugin_list_enabled(p_company_id uuid)
revoke execute on function public.plugin_list_enabled(p_company_id uuid) from anon;
revoke execute on function public.plugin_list_enabled(p_company_id uuid) from public;

-- public.portal_create_check_in_token(p_company_id uuid, p_booking_id uuid)
revoke execute on function public.portal_create_check_in_token(p_company_id uuid, p_booking_id uuid) from anon;
revoke execute on function public.portal_create_check_in_token(p_company_id uuid, p_booking_id uuid) from public;

-- public.portal_get_document_signed_url(p_document_id uuid)
revoke execute on function public.portal_get_document_signed_url(p_document_id uuid) from anon;
revoke execute on function public.portal_get_document_signed_url(p_document_id uuid) from public;

-- public.provision_company_commercial_access_v1(p_company_id uuid, p_mode text)
revoke execute on function public.provision_company_commercial_access_v1(p_company_id uuid, p_mode text) from anon;

-- public.provision_company_default_roles(p_company_id uuid)
revoke execute on function public.provision_company_default_roles(p_company_id uuid) from anon;

-- public.provision_tenant_ai_bootstrap(p_company_id uuid)
revoke execute on function public.provision_tenant_ai_bootstrap(p_company_id uuid) from anon;

-- public.provision_tenant_default_roles(p_company_id uuid)
revoke execute on function public.provision_tenant_default_roles(p_company_id uuid) from anon;

-- public.publish_automation_workflow_version(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid)
revoke execute on function public.publish_automation_workflow_version(p_flow_id uuid, p_company_id uuid, p_release_notes text, p_snapshot jsonb, p_published_by uuid, p_flow_name text, p_flow_description text, p_flow_trigger_type text, p_flow_metadata jsonb, p_updated_by uuid) from anon;

-- public.record_billing_checkout_payment_event_v1(p_provider_code text, p_provider_event_id text, p_event_type text, p_normalized_status text, p_provider_session_id text, p_provider_payment_id text, p_checkout_session_id uuid, p_payload jsonb, p_idempotency_key text, p_failure_code text, p_failure_message text)
revoke execute on function public.record_billing_checkout_payment_event_v1(p_provider_code text, p_provider_event_id text, p_event_type text, p_normalized_status text, p_provider_session_id text, p_provider_payment_id text, p_checkout_session_id uuid, p_payload jsonb, p_idempotency_key text, p_failure_code text, p_failure_message text) from anon;

-- public.record_company_whatsapp_credential_health(p_company_id uuid, p_token_status text, p_token_expires_at timestamp with time zone, p_clear_token_expires_at boolean, p_token_checked_at timestamp with time zone, p_last_successful_send_at timestamp with time zone, p_last_auth_error text, p_clear_last_auth_error boolean, p_last_auth_error_at timestamp with time zone, p_last_auth_error_code integer, p_clear_last_auth_error_code boolean)
revoke execute on function public.record_company_whatsapp_credential_health(p_company_id uuid, p_token_status text, p_token_expires_at timestamp with time zone, p_clear_token_expires_at boolean, p_token_checked_at timestamp with time zone, p_last_successful_send_at timestamp with time zone, p_last_auth_error text, p_clear_last_auth_error boolean, p_last_auth_error_at timestamp with time zone, p_last_auth_error_code integer, p_clear_last_auth_error_code boolean) from anon;
revoke execute on function public.record_company_whatsapp_credential_health(p_company_id uuid, p_token_status text, p_token_expires_at timestamp with time zone, p_clear_token_expires_at boolean, p_token_checked_at timestamp with time zone, p_last_successful_send_at timestamp with time zone, p_last_auth_error text, p_clear_last_auth_error boolean, p_last_auth_error_at timestamp with time zone, p_last_auth_error_code integer, p_clear_last_auth_error_code boolean) from public;

-- public.record_subscription_renewal_failure_v1(p_company_id uuid, p_reason text)
revoke execute on function public.record_subscription_renewal_failure_v1(p_company_id uuid, p_reason text) from anon;

-- public.recover_stale_embedding_jobs(p_stale_seconds integer)
revoke execute on function public.recover_stale_embedding_jobs(p_stale_seconds integer) from anon;
revoke execute on function public.recover_stale_embedding_jobs(p_stale_seconds integer) from public;

-- public.refresh_company_usage_snapshot(p_company_id uuid)
revoke execute on function public.refresh_company_usage_snapshot(p_company_id uuid) from anon;

-- public.reject_company_v1(p_company_id uuid, p_reason text)
revoke execute on function public.reject_company_v1(p_company_id uuid, p_reason text) from anon;

-- public.remove_company_employee(p_user_id uuid)
revoke execute on function public.remove_company_employee(p_user_id uuid) from anon;

-- public.renew_subscription_from_payment(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean)
revoke execute on function public.renew_subscription_from_payment(p_company_id uuid, p_amount numeric, p_currency text, p_payment_method_label text, p_provider text, p_provider_payment_id text, p_metadata jsonb, p_payment_method_code text, p_idempotency_key text, p_amount_mode text, p_expected_subscription_id uuid, p_advance_period boolean) from anon;

-- public.repair_companies_missing_roles()
revoke execute on function public.repair_companies_missing_roles() from anon;
revoke execute on function public.repair_companies_missing_roles() from public;

-- public.repair_subscription_detail_demo_v1()
revoke execute on function public.repair_subscription_detail_demo_v1() from anon;

-- public.repair_tenant_ai_bootstrap()
revoke execute on function public.repair_tenant_ai_bootstrap() from anon;

-- public.replace_user_role(p_user_id uuid, p_role_id uuid)
revoke execute on function public.replace_user_role(p_user_id uuid, p_role_id uuid) from anon;

-- public.replace_user_roles(p_user_id uuid, p_role_ids uuid[])
revoke execute on function public.replace_user_roles(p_user_id uuid, p_role_ids uuid[]) from anon;

-- public.require_company_feature_v1(p_company_id uuid, p_feature_code text)
revoke execute on function public.require_company_feature_v1(p_company_id uuid, p_feature_code text) from anon;

-- public.reset_enterprise_demo_v1()
revoke execute on function public.reset_enterprise_demo_v1() from anon;

-- public.resolve_active_payment_provider_code(p_company_id uuid)
revoke execute on function public.resolve_active_payment_provider_code(p_company_id uuid) from anon;

-- public.resolve_billing_setting_boolean(p_code text, p_company_id uuid)
revoke execute on function public.resolve_billing_setting_boolean(p_code text, p_company_id uuid) from anon;

-- public.resolve_billing_setting_integer(p_code text, p_company_id uuid)
revoke execute on function public.resolve_billing_setting_integer(p_code text, p_company_id uuid) from anon;

-- public.resolve_billing_setting_value(p_code text, p_company_id uuid)
revoke execute on function public.resolve_billing_setting_value(p_code text, p_company_id uuid) from anon;

-- public.resolve_payment_method_type_id(p_code text, p_company_id uuid)
revoke execute on function public.resolve_payment_method_type_id(p_code text, p_company_id uuid) from anon;

-- public.resolve_supported_payment_method_codes(p_company_id uuid)
revoke execute on function public.resolve_supported_payment_method_codes(p_company_id uuid) from anon;

-- public.restore_billing_subscription(p_company_id uuid, p_reason text)
revoke execute on function public.restore_billing_subscription(p_company_id uuid, p_reason text) from anon;

-- public.retry_tenant_provisioning(p_company_id uuid)
revoke execute on function public.retry_tenant_provisioning(p_company_id uuid) from anon;
revoke execute on function public.retry_tenant_provisioning(p_company_id uuid) from public;

-- public.revoke_company_feature_grant(p_company_id uuid, p_feature_code text, p_notes text)
revoke execute on function public.revoke_company_feature_grant(p_company_id uuid, p_feature_code text, p_notes text) from anon;

-- public.rollup_usage_aggregates(p_granularity text, p_from timestamp with time zone, p_to timestamp with time zone)
revoke execute on function public.rollup_usage_aggregates(p_granularity text, p_from timestamp with time zone, p_to timestamp with time zone) from anon;

-- public.run_subscription_lifecycle_enforcement_v1(p_limit integer)
revoke execute on function public.run_subscription_lifecycle_enforcement_v1(p_limit integer) from anon;

-- public.save_company_brand_center(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text)
revoke execute on function public.save_company_brand_center(p_company_id uuid, p_branding jsonb, p_logo_url text, p_company_name text, p_legal_name text, p_support_email text, p_support_phone text, p_invoice_footer text) from anon;

-- public.seed_enterprise_demo_v1()
revoke execute on function public.seed_enterprise_demo_v1() from anon;

-- public.set_commercial_package_features_v1(p_plan_id uuid, p_feature_codes text[])
revoke execute on function public.set_commercial_package_features_v1(p_plan_id uuid, p_feature_codes text[]) from anon;

-- public.set_company_feature_grant(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text)
revoke execute on function public.set_company_feature_grant(p_company_id uuid, p_feature_code text, p_enabled boolean, p_source text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_notes text, p_reason text) from anon;

-- public.set_company_feature_override(p_company_id uuid, p_feature_code text, p_override_state text, p_reason text, p_expires_at timestamp with time zone)
revoke execute on function public.set_company_feature_override(p_company_id uuid, p_feature_code text, p_override_state text, p_reason text, p_expires_at timestamp with time zone) from anon;

-- public.settle_saas_verified_payment_v1(p_checkout_session_id uuid)
revoke execute on function public.settle_saas_verified_payment_v1(p_checkout_session_id uuid) from anon;

-- public.suspend_billing_subscription(p_company_id uuid, p_reason text)
revoke execute on function public.suspend_billing_subscription(p_company_id uuid, p_reason text) from anon;

-- public.switch_enterprise_demo_scenario_v1(p_scenario_code text)
revoke execute on function public.switch_enterprise_demo_scenario_v1(p_scenario_code text) from anon;

-- public.sync_company_package_entitlements_v1(p_company_id uuid)
revoke execute on function public.sync_company_package_entitlements_v1(p_company_id uuid) from anon;

-- public.sync_company_subscription_denormalized(p_company_id uuid)
revoke execute on function public.sync_company_subscription_denormalized(p_company_id uuid) from anon;

-- public.sync_email_channel_references(p_company_id uuid)
revoke execute on function public.sync_email_channel_references(p_company_id uuid) from anon;
revoke execute on function public.sync_email_channel_references(p_company_id uuid) from public;

-- public.sync_instagram_channel_references(p_company_id uuid)
revoke execute on function public.sync_instagram_channel_references(p_company_id uuid) from anon;
revoke execute on function public.sync_instagram_channel_references(p_company_id uuid) from public;

-- public.sync_messenger_channel_references(p_company_id uuid)
revoke execute on function public.sync_messenger_channel_references(p_company_id uuid) from anon;
revoke execute on function public.sync_messenger_channel_references(p_company_id uuid) from public;

-- public.sync_whatsapp_channel_references(p_company_id uuid)
revoke execute on function public.sync_whatsapp_channel_references(p_company_id uuid) from anon;
revoke execute on function public.sync_whatsapp_channel_references(p_company_id uuid) from public;

-- public.teardown_enterprise_demo_v1()
revoke execute on function public.teardown_enterprise_demo_v1() from anon;

-- public.trg_assert_tenant_company_admin()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.trg_assert_tenant_company_admin() from anon;
revoke execute on function public.trg_assert_tenant_company_admin() from public;

-- public.trg_companies_execute_tenant_provisioning()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.trg_companies_execute_tenant_provisioning() from anon;
revoke execute on function public.trg_companies_execute_tenant_provisioning() from public;

-- public.trg_companies_provision_default_roles()
revoke execute on function public.trg_companies_provision_default_roles() from anon;
revoke execute on function public.trg_companies_provision_default_roles() from public;

-- public.trg_crm_set_company_id()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.trg_crm_set_company_id() from anon;
revoke execute on function public.trg_crm_set_company_id() from public;

-- public.trg_profiles_assert_company_admin()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.trg_profiles_assert_company_admin() from anon;
revoke execute on function public.trg_profiles_assert_company_admin() from public;

-- public.update_billing_settings(p_scope_type text, p_company_id uuid, p_changes jsonb)
revoke execute on function public.update_billing_settings(p_scope_type text, p_company_id uuid, p_changes jsonb) from anon;

-- public.update_company_email_imap_cursor(p_company_id uuid, p_last_uid bigint)
revoke execute on function public.update_company_email_imap_cursor(p_company_id uuid, p_last_uid bigint) from anon;
revoke execute on function public.update_company_email_imap_cursor(p_company_id uuid, p_last_uid bigint) from public;

-- public.update_my_profile(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text)
revoke execute on function public.update_my_profile(p_full_name text, p_avatar_url text, p_preferred_language text, p_timezone text, p_preferred_theme text, p_job_title text, p_department text, p_phone text) from anon;

-- public.upsert_billing_contact(p_company_id uuid, p_name text, p_email text, p_phone text)
revoke execute on function public.upsert_billing_contact(p_company_id uuid, p_name text, p_email text, p_phone text) from anon;

-- public.upsert_commercial_package_v1(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text)
revoke execute on function public.upsert_commercial_package_v1(p_code text, p_name text, p_id uuid, p_display_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric, p_is_active boolean, p_is_highlighted boolean, p_is_public boolean, p_sort_order integer, p_tier_rank integer, p_metadata jsonb, p_max_users integer, p_max_customers integer, p_storage_gb numeric, p_ai_tokens_monthly bigint, p_pricing_mode text) from anon;

-- public.upsert_company_email_settings(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text)
revoke execute on function public.upsert_company_email_settings(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) from anon;
revoke execute on function public.upsert_company_email_settings(p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text) from public;

-- public.upsert_company_instagram_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text)
revoke execute on function public.upsert_company_instagram_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from anon;
revoke execute on function public.upsert_company_instagram_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_page_id text, p_instagram_business_account_id text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;

-- public.upsert_company_messenger_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text)
revoke execute on function public.upsert_company_messenger_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from anon;
revoke execute on function public.upsert_company_messenger_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_page_id text, p_access_token text, p_webhook_verify_token text, p_api_version text, p_app_secret text) from public;

-- public.upsert_company_whatsapp_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text)
revoke execute on function public.upsert_company_whatsapp_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) from anon;
revoke execute on function public.upsert_company_whatsapp_settings(p_company_id uuid, p_enabled boolean, p_provider text, p_access_token text, p_phone_number_id text, p_business_account_id text, p_webhook_verify_token text, p_default_language text, p_max_retry_count integer, p_api_version text, p_app_secret text) from public;

-- public.user_has_permission(p_code text)
revoke execute on function public.user_has_permission(p_code text) from anon;
revoke execute on function public.user_has_permission(p_code text) from public;

-- public.user_has_permission_in_company(p_company_id uuid, p_code text)
revoke execute on function public.user_has_permission_in_company(p_company_id uuid, p_code text) from anon;
revoke execute on function public.user_has_permission_in_company(p_company_id uuid, p_code text) from public;

-- public.validate_billing_setting_value(p_definition_code text, p_value jsonb)
revoke execute on function public.validate_billing_setting_value(p_definition_code text, p_value jsonb) from anon;

-- public.verify_commercial_package_mapping_integrity_v1()
revoke execute on function public.verify_commercial_package_mapping_integrity_v1() from anon;

-- public.verify_commercial_package_pricing_integrity_v1()
revoke execute on function public.verify_commercial_package_pricing_integrity_v1() from anon;

-- public.verify_company_email_imap(p_company_id uuid)
revoke execute on function public.verify_company_email_imap(p_company_id uuid) from anon;
revoke execute on function public.verify_company_email_imap(p_company_id uuid) from public;

-- public.verify_company_email_smtp(p_company_id uuid)
revoke execute on function public.verify_company_email_smtp(p_company_id uuid) from anon;
revoke execute on function public.verify_company_email_smtp(p_company_id uuid) from public;

-- public.verify_subscription_lifecycle_integrity_v1()
revoke execute on function public.verify_subscription_lifecycle_integrity_v1() from anon;

-- public.whatsapp_crypto_secret()
revoke execute on function public.whatsapp_crypto_secret() from anon;
revoke execute on function public.whatsapp_crypto_secret() from public;

-- public.whatsapp_decrypt_secret(p_encrypted bytea)
revoke execute on function public.whatsapp_decrypt_secret(p_encrypted bytea) from anon;
revoke execute on function public.whatsapp_decrypt_secret(p_encrypted bytea) from public;

-- public.whatsapp_encrypt_secret(p_plaintext text)
revoke execute on function public.whatsapp_encrypt_secret(p_plaintext text) from anon;
revoke execute on function public.whatsapp_encrypt_secret(p_plaintext text) from public;

-- public.whatsapp_settings_can_manage(p_company_id uuid)
revoke execute on function public.whatsapp_settings_can_manage(p_company_id uuid) from anon;
revoke execute on function public.whatsapp_settings_can_manage(p_company_id uuid) from public;

-- public.write_ai_execution_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_ai_execution_audit_log() from anon;
revoke execute on function public.write_ai_execution_audit_log() from public;

-- public.write_ai_provider_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_ai_provider_audit_log() from anon;
revoke execute on function public.write_ai_provider_audit_log() from public;

-- public.write_ai_token_cost_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_ai_token_cost_audit_log() from anon;
revoke execute on function public.write_ai_token_cost_audit_log() from public;

-- public.write_ai_trace_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_ai_trace_audit_log() from anon;
revoke execute on function public.write_ai_trace_audit_log() from public;

-- public.write_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_audit_log() from anon;
revoke execute on function public.write_audit_log() from public;

-- public.write_audit_log_junction()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_audit_log_junction() from anon;
revoke execute on function public.write_audit_log_junction() from public;

-- public.write_automation_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_automation_audit_log() from anon;
revoke execute on function public.write_automation_audit_log() from public;

-- public.write_billing_audit_log(p_event_type text, p_company_id uuid, p_previous_value jsonb, p_new_value jsonb, p_source text, p_metadata jsonb)
revoke execute on function public.write_billing_audit_log(p_event_type text, p_company_id uuid, p_previous_value jsonb, p_new_value jsonb, p_source text, p_metadata jsonb) from anon;

-- public.write_embedding_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_embedding_audit_log() from anon;
revoke execute on function public.write_embedding_audit_log() from public;

-- public.write_intent_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_intent_audit_log() from anon;
revoke execute on function public.write_intent_audit_log() from public;

-- public.write_knowledge_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_knowledge_audit_log() from anon;
revoke execute on function public.write_knowledge_audit_log() from public;

-- public.write_prompt_orchestrator_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_prompt_orchestrator_audit_log() from anon;
revoke execute on function public.write_prompt_orchestrator_audit_log() from public;

-- public.write_retrieval_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_retrieval_audit_log() from anon;
revoke execute on function public.write_retrieval_audit_log() from public;

-- public.write_runtime_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_runtime_audit_log() from anon;
revoke execute on function public.write_runtime_audit_log() from public;

-- public.write_support_ticket_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_support_ticket_audit_log() from anon;
revoke execute on function public.write_support_ticket_audit_log() from public;

-- public.write_tool_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_tool_audit_log() from anon;
revoke execute on function public.write_tool_audit_log() from public;

-- public.write_vector_query_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_vector_query_audit_log() from anon;
revoke execute on function public.write_vector_query_audit_log() from public;

-- public.write_vector_store_audit_log()
-- trigger-backed: client EXECUTE revoked; trigger execution preserved
revoke execute on function public.write_vector_store_audit_log() from anon;
revoke execute on function public.write_vector_store_audit_log() from public;

-- ── End Phase 1B ────────────────────────────────────────────
-- Revoked anon EXECUTE on 257 functions.
-- Also revoked PUBLIC EXECUTE on 130 functions that had it.
-- Preserved 5 intentional portal anon RPCs without ACL changes.
