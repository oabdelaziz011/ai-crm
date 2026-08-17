-- ============================================================
-- 284 — Phase 2 Batch 1: revoke authenticated EXECUTE from
-- confirmed internal SECURITY DEFINER functions.
--
-- Scope (exact live-verified signatures only):
--   - trigger / notify / write_audit / assign_* number helpers
--   - crypto/secret primitives without login-app .rpc() callers
--   - settle_saas_verified_payment_v1 (service_role settlement)
--   - private underscore helpers with no login-app callers
--
-- Does NOT touch:
--   - 121 KEEP authenticated RPCs
--   - NEEDS REVIEW privileged UI/lifecycle functions
--   - intentional anon portal RPCs
--   - function bodies, triggers, search_path, or business logic
--
-- For each target: REVOKE EXECUTE FROM authenticated only.
-- service_role / postgres / trigger execution preserved.
-- No PUBLIC EXECUTE was present on these Batch 1 targets.
-- ============================================================

-- Deferred to NEEDS REVIEW (login-app .rpc() callers present):
--   public.get_company_email_settings_decrypted(p_company_id uuid)
--   public.get_company_whatsapp_settings_decrypted(p_company_id uuid)

-- ── TRIGGER (38) ───────────────────────────────
-- trigger-backed: public._company_subscriptions_status_transition_guard() — client EXECUTE revoked; trigger OK
revoke execute on function public._company_subscriptions_status_transition_guard() from authenticated;

-- trigger-backed: public.assign_conversation_number() — client EXECUTE revoked; trigger OK
revoke execute on function public.assign_conversation_number() from authenticated;

-- trigger-backed: public.assign_scheduling_booking_confirmation_number() — client EXECUTE revoked; trigger OK
revoke execute on function public.assign_scheduling_booking_confirmation_number() from authenticated;

-- trigger-backed: public.billing_notification_in_app_subscriber() — client EXECUTE revoked; trigger OK
revoke execute on function public.billing_notification_in_app_subscriber() from authenticated;

-- trigger-backed: public.handle_new_user() — client EXECUTE revoked; trigger OK
revoke execute on function public.handle_new_user() from authenticated;

-- trigger-backed: public.notify_audit_events() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_audit_events() from authenticated;

-- trigger-backed: public.notify_booking_changes() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_booking_changes() from authenticated;

-- public.notify_company_whatsapp_credential_admins(p_company_id uuid, p_title text, p_message text, p_min_interval_seconds integer)
revoke execute on function public.notify_company_whatsapp_credential_admins(p_company_id uuid, p_title text, p_message text, p_min_interval_seconds integer) from authenticated;

-- trigger-backed: public.notify_customer_created() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_customer_created() from authenticated;

-- public.notify_external_event(p_company_id uuid, p_user_id uuid, p_event text, p_message text)
revoke execute on function public.notify_external_event(p_company_id uuid, p_user_id uuid, p_event text, p_message text) from authenticated;

-- trigger-backed: public.notify_invoice_changes() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_invoice_changes() from authenticated;

-- trigger-backed: public.notify_profile_events() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_profile_events() from authenticated;

-- trigger-backed: public.notify_role_events() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_role_events() from authenticated;

-- trigger-backed: public.notify_role_updated() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_role_updated() from authenticated;

-- trigger-backed: public.notify_subscription_events() — client EXECUTE revoked; trigger OK
revoke execute on function public.notify_subscription_events() from authenticated;

-- trigger-backed: public.trg_assert_tenant_company_admin() — client EXECUTE revoked; trigger OK
revoke execute on function public.trg_assert_tenant_company_admin() from authenticated;

-- trigger-backed: public.trg_companies_execute_tenant_provisioning() — client EXECUTE revoked; trigger OK
revoke execute on function public.trg_companies_execute_tenant_provisioning() from authenticated;

-- public.trg_companies_provision_default_roles()
revoke execute on function public.trg_companies_provision_default_roles() from authenticated;

-- trigger-backed: public.trg_crm_set_company_id() — client EXECUTE revoked; trigger OK
revoke execute on function public.trg_crm_set_company_id() from authenticated;

-- trigger-backed: public.trg_profiles_assert_company_admin() — client EXECUTE revoked; trigger OK
revoke execute on function public.trg_profiles_assert_company_admin() from authenticated;

-- trigger-backed: public.write_ai_execution_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_ai_execution_audit_log() from authenticated;

-- trigger-backed: public.write_ai_provider_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_ai_provider_audit_log() from authenticated;

-- trigger-backed: public.write_ai_token_cost_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_ai_token_cost_audit_log() from authenticated;

-- trigger-backed: public.write_ai_trace_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_ai_trace_audit_log() from authenticated;

-- trigger-backed: public.write_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_audit_log() from authenticated;

-- trigger-backed: public.write_audit_log_junction() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_audit_log_junction() from authenticated;

-- trigger-backed: public.write_automation_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_automation_audit_log() from authenticated;

-- public.write_billing_audit_log(p_event_type text, p_company_id uuid, p_previous_value jsonb, p_new_value jsonb, p_source text, p_metadata jsonb)
revoke execute on function public.write_billing_audit_log(p_event_type text, p_company_id uuid, p_previous_value jsonb, p_new_value jsonb, p_source text, p_metadata jsonb) from authenticated;

-- trigger-backed: public.write_embedding_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_embedding_audit_log() from authenticated;

-- trigger-backed: public.write_intent_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_intent_audit_log() from authenticated;

-- trigger-backed: public.write_knowledge_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_knowledge_audit_log() from authenticated;

-- trigger-backed: public.write_prompt_orchestrator_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_prompt_orchestrator_audit_log() from authenticated;

-- trigger-backed: public.write_retrieval_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_retrieval_audit_log() from authenticated;

-- trigger-backed: public.write_runtime_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_runtime_audit_log() from authenticated;

-- trigger-backed: public.write_support_ticket_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_support_ticket_audit_log() from authenticated;

-- trigger-backed: public.write_tool_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_tool_audit_log() from authenticated;

-- trigger-backed: public.write_vector_query_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_vector_query_audit_log() from authenticated;

-- trigger-backed: public.write_vector_store_audit_log() — client EXECUTE revoked; trigger OK
revoke execute on function public.write_vector_store_audit_log() from authenticated;


-- ── CRYPTO (9) ───────────────────────────────
-- public.get_company_instagram_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_instagram_settings_decrypted(p_company_id uuid) from authenticated;

-- public.get_company_messenger_settings_decrypted(p_company_id uuid)
revoke execute on function public.get_company_messenger_settings_decrypted(p_company_id uuid) from authenticated;

-- public.platform_ai_crypto_secret()
revoke execute on function public.platform_ai_crypto_secret() from authenticated;

-- public.platform_ai_decrypt_key(p_encrypted bytea)
revoke execute on function public.platform_ai_decrypt_key(p_encrypted bytea) from authenticated;

-- public.platform_ai_encrypt_key(p_plaintext text)
revoke execute on function public.platform_ai_encrypt_key(p_plaintext text) from authenticated;

-- public.platform_ai_store_crypto_secret(p_secret text)
revoke execute on function public.platform_ai_store_crypto_secret(p_secret text) from authenticated;

-- public.whatsapp_crypto_secret()
revoke execute on function public.whatsapp_crypto_secret() from authenticated;

-- public.whatsapp_decrypt_secret(p_encrypted bytea)
revoke execute on function public.whatsapp_decrypt_secret(p_encrypted bytea) from authenticated;

-- public.whatsapp_encrypt_secret(p_plaintext text)
revoke execute on function public.whatsapp_encrypt_secret(p_plaintext text) from authenticated;


-- ── SETTLEMENT (1) ───────────────────────────────
-- public.settle_saas_verified_payment_v1(p_checkout_session_id uuid)
revoke execute on function public.settle_saas_verified_payment_v1(p_checkout_session_id uuid) from authenticated;


-- ── UNDERSCORE (16) ───────────────────────────────
-- public._apply_company_onboarding_identity(p_company_id uuid, p_payload jsonb)
revoke execute on function public._apply_company_onboarding_identity(p_company_id uuid, p_payload jsonb) from authenticated;

-- public._apply_configured_trial_feature_grants(p_company_id uuid, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_grant_source text)
revoke execute on function public._apply_configured_trial_feature_grants(p_company_id uuid, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_grant_source text) from authenticated;

-- public._apply_demo_scenario_v1(p_scenario text)
revoke execute on function public._apply_demo_scenario_v1(p_scenario text) from authenticated;

-- public._assert_lifecycle_enforcement_caller()
revoke execute on function public._assert_lifecycle_enforcement_caller() from authenticated;

-- public._billing_payment_settlement_result_v1(p_payment_id uuid)
revoke execute on function public._billing_payment_settlement_result_v1(p_payment_id uuid) from authenticated;

-- public._can_manage_commercial_packages()
revoke execute on function public._can_manage_commercial_packages() from authenticated;

-- public._demo_auth_user(p_user_id uuid, p_email text, p_full_name text, p_password text)
revoke execute on function public._demo_auth_user(p_user_id uuid, p_email text, p_full_name text, p_password text) from authenticated;

-- public._demo_register(p_table text, p_id uuid)
revoke execute on function public._demo_register(p_table text, p_id uuid) from authenticated;

-- public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid)
revoke execute on function public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid) from authenticated;

-- public._demo_set_triggers(enabled boolean)
revoke execute on function public._demo_set_triggers(enabled boolean) from authenticated;

-- public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid)
revoke execute on function public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid) from authenticated;

-- public._ensure_company_subscription_row(p_company_id uuid, p_start_trial boolean, p_billing_cycle text, p_plan_id uuid)
revoke execute on function public._ensure_company_subscription_row(p_company_id uuid, p_start_trial boolean, p_billing_cycle text, p_plan_id uuid) from authenticated;

-- public._ensure_core_system_feature_grants(p_company_id uuid)
revoke execute on function public._ensure_core_system_feature_grants(p_company_id uuid) from authenticated;

-- public._package_feature_codes(p_plan_id uuid)
revoke execute on function public._package_feature_codes(p_plan_id uuid) from authenticated;

-- public._resolve_default_onboarding_plan_id()
revoke execute on function public._resolve_default_onboarding_plan_id() from authenticated;

-- public._sync_company_package_entitlements_internal(p_company_id uuid)
revoke execute on function public._sync_company_package_entitlements_internal(p_company_id uuid) from authenticated;


-- ── End Phase 2 Batch 1 ─────────────────────────────────────
-- Revoked authenticated EXECUTE on 64 functions.
-- No new grants added. service_role grants left unchanged.
