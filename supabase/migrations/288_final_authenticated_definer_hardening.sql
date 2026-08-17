-- ============================================================
-- 288 — Final Security Advisor hardening (authenticated DEFINER)
--
-- Revoke authenticated EXECUTE from proven internal / server-only
-- SECURITY DEFINER functions that have no legitimate browser RPC
-- requirement, plus service_role-only credential decryptors that
-- still had authenticated EXECUTE.
--
-- KEEP (do not touch):
--   - All confirmed login-app browser product/admin RPCs
--   - RLS helper DEFINER functions (is_super_admin, current_company_id,
--     company_has_permission, get_user_company_id, etc.)
--   - Intentional anon portal RPCs (5)
--   - Lib-package browser paths (pgvector_*, publish_automation_*,
--     platform_ai_feature_enabled, repair_tenant_ai_bootstrap, …)
--   - platform_resolve_ai_runtime_config (already service_role-only via 287)
--
-- Does NOT:
--   - change RLS policies
--   - change function bodies / business logic
--   - grant PUBLIC or anon
--   - revoke service_role
--   - start broad Advisor zero-warning cleanup of intentional product RPCs
-- ============================================================

-- ── Real risk: unauthenticated-sensitive internals (no browser caller) ──
revoke execute on function public.integration_retry_dead_letter(uuid, integer) from authenticated;
revoke execute on function public.integration_retry_dead_letter(uuid, integer) from anon;
revoke execute on function public.integration_retry_dead_letter(uuid, integer) from public;

revoke execute on function public.emit_subscription_event(uuid, uuid, text, text, text, jsonb, timestamp with time zone) from authenticated;
revoke execute on function public.emit_subscription_event(uuid, uuid, text, text, text, jsonb, timestamp with time zone) from anon;
revoke execute on function public.emit_subscription_event(uuid, uuid, text, text, text, jsonb, timestamp with time zone) from public;

revoke execute on function public.insert_notification(uuid, uuid, text, text, text, text) from authenticated;
revoke execute on function public.insert_notification(uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.insert_notification(uuid, uuid, text, text, text, text) from public;

revoke execute on function public.notification_bus_emit_v1(text, uuid, uuid, jsonb, text[], text) from authenticated;
revoke execute on function public.notification_bus_emit_v1(text, uuid, uuid, jsonb, text[], text) from anon;
revoke execute on function public.notification_bus_emit_v1(text, uuid, uuid, jsonb, text[], text) from public;

revoke execute on function public.company_id_for_user(uuid) from authenticated;
revoke execute on function public.company_id_for_user(uuid) from anon;
revoke execute on function public.company_id_for_user(uuid) from public;

revoke execute on function public.conversation_audit_company_id(uuid) from authenticated;
revoke execute on function public.conversation_audit_company_id(uuid) from anon;
revoke execute on function public.conversation_audit_company_id(uuid) from public;

-- ── Credential decryptors: body already requires service_role ──
revoke execute on function public.get_company_email_settings_decrypted(uuid) from authenticated;
revoke execute on function public.get_company_email_settings_decrypted(uuid) from anon;
revoke execute on function public.get_company_email_settings_decrypted(uuid) from public;

revoke execute on function public.get_company_whatsapp_settings_decrypted(uuid) from authenticated;
revoke execute on function public.get_company_whatsapp_settings_decrypted(uuid) from anon;
revoke execute on function public.get_company_whatsapp_settings_decrypted(uuid) from public;

-- ── Subscription lifecycle internals (called via DEFINER runner / service_role) ──
revoke execute on function public.enforce_active_period_due_v1(integer) from authenticated;
revoke execute on function public.enforce_active_period_due_v1(integer) from anon;
revoke execute on function public.enforce_active_period_due_v1(integer) from public;

revoke execute on function public.enforce_grace_period_expirations_v1(integer) from authenticated;
revoke execute on function public.enforce_grace_period_expirations_v1(integer) from anon;
revoke execute on function public.enforce_grace_period_expirations_v1(integer) from public;

revoke execute on function public.enforce_past_due_to_grace_v1(integer) from authenticated;
revoke execute on function public.enforce_past_due_to_grace_v1(integer) from anon;
revoke execute on function public.enforce_past_due_to_grace_v1(integer) from public;

revoke execute on function public.enforce_trial_expirations_v1(integer) from authenticated;
revoke execute on function public.enforce_trial_expirations_v1(integer) from anon;
revoke execute on function public.enforce_trial_expirations_v1(integer) from public;

revoke execute on function public.sync_company_subscription_denormalized(uuid) from authenticated;
revoke execute on function public.sync_company_subscription_denormalized(uuid) from anon;
revoke execute on function public.sync_company_subscription_denormalized(uuid) from public;

-- ── Channel sync helpers (nested from settings upsert DEFINER) ──
revoke execute on function public.sync_email_channel_references(uuid) from authenticated;
revoke execute on function public.sync_email_channel_references(uuid) from anon;
revoke execute on function public.sync_email_channel_references(uuid) from public;

revoke execute on function public.sync_instagram_channel_references(uuid) from authenticated;
revoke execute on function public.sync_instagram_channel_references(uuid) from anon;
revoke execute on function public.sync_instagram_channel_references(uuid) from public;

revoke execute on function public.sync_messenger_channel_references(uuid) from authenticated;
revoke execute on function public.sync_messenger_channel_references(uuid) from anon;
revoke execute on function public.sync_messenger_channel_references(uuid) from public;

revoke execute on function public.sync_whatsapp_channel_references(uuid) from authenticated;
revoke execute on function public.sync_whatsapp_channel_references(uuid) from anon;
revoke execute on function public.sync_whatsapp_channel_references(uuid) from public;

-- ── Billing snapshot / format / resolve helpers (nested only) ──
revoke execute on function public.build_billing_company_snapshot(uuid) from authenticated;
revoke execute on function public.build_billing_company_snapshot(uuid) from anon;
revoke execute on function public.build_billing_company_snapshot(uuid) from public;

revoke execute on function public.build_billing_contact_snapshot(uuid) from authenticated;
revoke execute on function public.build_billing_contact_snapshot(uuid) from anon;
revoke execute on function public.build_billing_contact_snapshot(uuid) from public;

revoke execute on function public.format_billing_document_number(text, uuid) from authenticated;
revoke execute on function public.format_billing_document_number(text, uuid) from anon;
revoke execute on function public.format_billing_document_number(text, uuid) from public;

revoke execute on function public.resolve_active_payment_provider_code(uuid) from authenticated;
revoke execute on function public.resolve_active_payment_provider_code(uuid) from anon;
revoke execute on function public.resolve_active_payment_provider_code(uuid) from public;

revoke execute on function public.resolve_billing_setting_boolean(text, uuid) from authenticated;
revoke execute on function public.resolve_billing_setting_boolean(text, uuid) from anon;
revoke execute on function public.resolve_billing_setting_boolean(text, uuid) from public;

revoke execute on function public.resolve_payment_method_type_id(text, uuid) from authenticated;
revoke execute on function public.resolve_payment_method_type_id(text, uuid) from anon;
revoke execute on function public.resolve_payment_method_type_id(text, uuid) from public;

revoke execute on function public.resolve_supported_payment_method_codes(uuid) from authenticated;
revoke execute on function public.resolve_supported_payment_method_codes(uuid) from anon;
revoke execute on function public.resolve_supported_payment_method_codes(uuid) from public;

revoke execute on function public.validate_billing_setting_value(text, jsonb) from authenticated;
revoke execute on function public.validate_billing_setting_value(text, jsonb) from anon;
revoke execute on function public.validate_billing_setting_value(text, jsonb) from public;

-- ── Billing permission helpers used only as nested checks (not RLS) ──
revoke execute on function public.can_edit_billing() from authenticated;
revoke execute on function public.can_edit_billing() from anon;
revoke execute on function public.can_edit_billing() from public;

revoke execute on function public.can_edit_billing_settings(text, uuid) from authenticated;
revoke execute on function public.can_edit_billing_settings(text, uuid) from anon;
revoke execute on function public.can_edit_billing_settings(text, uuid) from public;

revoke execute on function public.can_export_billing_audit() from authenticated;
revoke execute on function public.can_export_billing_audit() from anon;
revoke execute on function public.can_export_billing_audit() from public;

revoke execute on function public.can_record_billing_payment() from authenticated;
revoke execute on function public.can_record_billing_payment() from anon;
revoke execute on function public.can_record_billing_payment() from public;

revoke execute on function public.can_view_own_billing() from authenticated;
revoke execute on function public.can_view_own_billing() from anon;
revoke execute on function public.can_view_own_billing() from public;

revoke execute on function public.can_access_workspace() from authenticated;
revoke execute on function public.can_access_workspace() from anon;
revoke execute on function public.can_access_workspace() from public;

revoke execute on function public.can_manage_own_billing() from authenticated;
revoke execute on function public.can_manage_own_billing() from anon;
revoke execute on function public.can_manage_own_billing() from public;

-- ── Provisioning / admin guards & integrity (no browser .rpc) ──
revoke execute on function public.assert_tenant_retains_active_company_admin(uuid) from authenticated;
revoke execute on function public.assert_tenant_retains_active_company_admin(uuid) from anon;
revoke execute on function public.assert_tenant_retains_active_company_admin(uuid) from public;

revoke execute on function public.audit_tenant_duplicate_admin_roles() from authenticated;
revoke execute on function public.audit_tenant_duplicate_admin_roles() from anon;
revoke execute on function public.audit_tenant_duplicate_admin_roles() from public;

revoke execute on function public.count_active_company_admin_assignees(uuid) from authenticated;
revoke execute on function public.count_active_company_admin_assignees(uuid) from anon;
revoke execute on function public.count_active_company_admin_assignees(uuid) from public;

revoke execute on function public.is_company_admin_role(uuid) from authenticated;
revoke execute on function public.is_company_admin_role(uuid) from anon;
revoke execute on function public.is_company_admin_role(uuid) from public;

revoke execute on function public.is_company_commercially_expired(uuid) from authenticated;
revoke execute on function public.is_company_commercially_expired(uuid) from anon;
revoke execute on function public.is_company_commercially_expired(uuid) from public;

revoke execute on function public.is_feature_commercially_gated(text) from authenticated;
revoke execute on function public.is_feature_commercially_gated(text) from anon;
revoke execute on function public.is_feature_commercially_gated(text) from public;

revoke execute on function public.user_has_permission_in_company(uuid, text) from authenticated;
revoke execute on function public.user_has_permission_in_company(uuid, text) from anon;
revoke execute on function public.user_has_permission_in_company(uuid, text) from public;

revoke execute on function public.platform_ai_ops_assert_super_admin() from authenticated;
revoke execute on function public.platform_ai_ops_assert_super_admin() from anon;
revoke execute on function public.platform_ai_ops_assert_super_admin() from public;

revoke execute on function public.repair_companies_missing_roles() from authenticated;
revoke execute on function public.repair_companies_missing_roles() from anon;
revoke execute on function public.repair_companies_missing_roles() from public;

revoke execute on function public.repair_subscription_detail_demo_v1() from authenticated;
revoke execute on function public.repair_subscription_detail_demo_v1() from anon;
revoke execute on function public.repair_subscription_detail_demo_v1() from public;

-- ── Unused / server-or-script paths ──
revoke execute on function public.cancel_embedding_job(uuid) from authenticated;
revoke execute on function public.cancel_embedding_job(uuid) from anon;
revoke execute on function public.cancel_embedding_job(uuid) from public;

revoke execute on function public.create_company_subscription_v1(uuid, uuid, text, boolean) from authenticated;
revoke execute on function public.create_company_subscription_v1(uuid, uuid, text, boolean) from anon;
revoke execute on function public.create_company_subscription_v1(uuid, uuid, text, boolean) from public;

revoke execute on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) from authenticated;
revoke execute on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) from anon;
revoke execute on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) from public;

revoke execute on function public.set_company_feature_override(uuid, text, text, text, timestamp with time zone) from authenticated;
revoke execute on function public.set_company_feature_override(uuid, text, text, text, timestamp with time zone) from anon;
revoke execute on function public.set_company_feature_override(uuid, text, text, text, timestamp with time zone) from public;

revoke execute on function public.financial_compute_analytics_snapshot_v1(date) from authenticated;
revoke execute on function public.financial_compute_analytics_snapshot_v1(date) from anon;
revoke execute on function public.financial_compute_analytics_snapshot_v1(date) from public;

revoke execute on function public.verify_commercial_package_mapping_integrity_v1() from authenticated;
revoke execute on function public.verify_commercial_package_mapping_integrity_v1() from anon;
revoke execute on function public.verify_commercial_package_mapping_integrity_v1() from public;

revoke execute on function public.verify_commercial_package_pricing_integrity_v1() from authenticated;
revoke execute on function public.verify_commercial_package_pricing_integrity_v1() from anon;
revoke execute on function public.verify_commercial_package_pricing_integrity_v1() from public;

revoke execute on function public.verify_subscription_lifecycle_integrity_v1() from authenticated;
revoke execute on function public.verify_subscription_lifecycle_integrity_v1() from anon;
revoke execute on function public.verify_subscription_lifecycle_integrity_v1() from public;

revoke execute on function public.verify_company_email_imap(uuid) from authenticated;
revoke execute on function public.verify_company_email_imap(uuid) from anon;
revoke execute on function public.verify_company_email_imap(uuid) from public;

revoke execute on function public.verify_company_email_smtp(uuid) from authenticated;
revoke execute on function public.verify_company_email_smtp(uuid) from anon;
revoke execute on function public.verify_company_email_smtp(uuid) from public;

-- NOTE: get_user_company_id intentionally KEPT — referenced by RLS policies.
-- NOTE: can_view_billing_* / is_super_admin / current_company_id / company_has_permission
--       intentionally KEPT — RLS helpers.
-- NOTE: notification_bus_publish_v1 intentionally KEPT — login-app billing bus caller.
