-- ============================================================
-- 286 — Security hardening final (safe one-pass)
--
-- A) REVOKE authenticated EXECUTE from proven nested/server
--    provisioning + demo internals (exact signatures only).
-- B) SET search_path on 72 SECURITY INVOKER functions flagged
--    by function_search_path_mutable (ALTER FUNCTION only).
--
-- Does NOT:
--   - touch intentional anon portal RPCs (5)
--   - revoke product/browser RPCs (incl. platform_resolve_ai_runtime_config)
--   - revoke repair_* platform-admin RPCs
--   - revoke decrypted settings RPCs with login-app callers
--   - change payment/billing/entitlement/RBAC logic or bodies
--   - enable leaked-password protection (Dashboard-only)
--   - add RLS policies
-- ============================================================

-- ── A. REVOKE authenticated EXECUTE (nested/server internals) ─
-- Nested from approve/onboard DEFINER flows; original GRANT service_role only
revoke execute on function public.provision_company_commercial_access_v1(p_company_id uuid, p_mode text) from authenticated;

-- Nested from execute_tenant_provisioning; assert_trusted; GRANT service_role
revoke execute on function public.provision_tenant_default_roles(p_company_id uuid) from authenticated;

-- Wrapper around provision_tenant_default_roles; GRANT service_role
revoke execute on function public.provision_company_default_roles(p_company_id uuid) from authenticated;

-- Nested from execute_tenant_provisioning; GRANT service_role
revoke execute on function public.provision_tenant_ai_bootstrap(p_company_id uuid) from authenticated;

-- Nested from trigger + retry_tenant_provisioning DEFINER; no direct login .rpc
revoke execute on function public.execute_tenant_provisioning(p_company_id uuid) from authenticated;

-- Internal guard; only PERFORM'd from DEFINER provisioning functions
revoke execute on function public.assert_trusted_provisioning_caller() from authenticated;

-- Nested from switch/reset demo DEFINER RPCs; original GRANT service_role
revoke execute on function public.seed_enterprise_demo_v1() from authenticated;

-- Scripts + nested demo flows; original GRANT service_role
revoke execute on function public.teardown_enterprise_demo_v1() from authenticated;

-- ── B. search_path fixes (INVOKER helpers / triggers) ───────
-- All targets are SECURITY INVOKER with empty proconfig.
-- Path chosen from body schema references (public / auth / extensions).

alter function public._company_onboarding_text(p_value text, p_max integer) set search_path to public;
alter function public.ai_assistant_settings_changed_fields(p_old ai_assistant_settings, p_new ai_assistant_settings) set search_path to public;
alter function public.ai_execution_audit_events(p_old ai_executions, p_new ai_executions, p_op text) set search_path to public;
alter function public.ai_provider_connection_audit_events(p_old ai_provider_connections, p_new ai_provider_connections, p_op text) set search_path to public;
alter function public.ai_trace_audit_events(p_old ai_traces, p_new ai_traces, p_op text) set search_path to public;
alter function public.assign_conversation_message_sequence() set search_path to public;
alter function public.automation_flow_audit_events(p_old automation_flows, p_new automation_flows, p_op text) set search_path to public;
alter function public.automation_run_audit_events(p_old automation_runs, p_new automation_runs, p_op text) set search_path to public;
alter function public.bump_ai_assistant_settings_version() set search_path to public;
alter function public.company_channel_audit_events(p_old company_channels, p_new company_channels, p_op text) set search_path to public;
alter function public.conversation_audit_events(p_old conversations, p_new conversations, p_op text) set search_path to public;
alter function public.email_settings_has_imap_password(settings_row company_email_settings) set search_path to public;
alter function public.email_settings_has_smtp_password(settings_row company_email_settings) set search_path to public;
alter function public.email_settings_row_to_public(settings_row company_email_settings) set search_path to public;
alter function public.embedding_job_audit_events(p_old embedding_jobs, p_new embedding_jobs, p_op text) set search_path to public;
alter function public.execution_policy_audit_events(p_old execution_policies, p_new execution_policies, p_op text) set search_path to public;
alter function public.indexed_vector_audit_events(p_old indexed_vectors, p_new indexed_vectors, p_op text) set search_path to public;
alter function public.instagram_settings_has_access_token(settings_row company_instagram_settings) set search_path to public;
alter function public.instagram_settings_has_app_secret(settings_row company_instagram_settings) set search_path to public;
alter function public.instagram_settings_has_webhook_token(settings_row company_instagram_settings) set search_path to public;
alter function public.instagram_settings_row_to_public(settings_row company_instagram_settings) set search_path to public;
alter function public.intent_definition_audit_events(p_old intent_definitions, p_new intent_definitions, p_op text) set search_path to public;
alter function public.intent_match_audit_events(p_new intent_matches) set search_path to public;
alter function public.is_valid_avatar_url(p_url text) set search_path to public;
alter function public.knowledge_chunks_search_vector_update() set search_path to public, extensions;
alter function public.knowledge_document_audit_events(p_old knowledge_documents, p_new knowledge_documents, p_op text) set search_path to public;
alter function public.knowledge_document_version_audit_events(p_old knowledge_document_versions, p_new knowledge_document_versions, p_op text) set search_path to public;
alter function public.knowledge_embedding_audit_events(p_old knowledge_embeddings, p_new knowledge_embeddings, p_op text) set search_path to public;
alter function public.knowledge_source_audit_events(p_old knowledge_sources, p_new knowledge_sources, p_op text) set search_path to public;
alter function public.messenger_settings_has_access_token(settings_row company_messenger_settings) set search_path to public;
alter function public.messenger_settings_has_app_secret(settings_row company_messenger_settings) set search_path to public;
alter function public.messenger_settings_has_webhook_token(settings_row company_messenger_settings) set search_path to public;
alter function public.messenger_settings_row_to_public(settings_row company_messenger_settings) set search_path to public;
alter function public.notification_payload(p_message_key text, p_params json) set search_path to public;
alter function public.notification_payload(p_message_key text, p_params jsonb) set search_path to public;
alter function public.organization_departments_validate_parent() set search_path to public;
alter function public.pgvector_pad_embedding(p_vector double precision[], p_dimensions integer) set search_path to public, extensions;
alter function public.prevent_ai_assistant_settings_physical_delete() set search_path to public;
alter function public.prevent_automation_version_graph_mutation() set search_path to public;
alter function public.prevent_company_channel_physical_delete() set search_path to public;
alter function public.prevent_conversation_message_mutation() set search_path to public;
alter function public.prevent_conversation_participant_physical_delete() set search_path to public;
alter function public.prevent_conversation_physical_delete() set search_path to public;
alter function public.prompt_template_audit_events(p_old prompt_templates, p_new prompt_templates, p_op text) set search_path to public;
alter function public.prompt_template_version_audit_events(p_old prompt_template_versions, p_new prompt_template_versions, p_op text) set search_path to public;
alter function public.protect_profile_privileged_columns() set search_path to public, auth;
alter function public.request_ip_address() set search_path to public;
alter function public.resolve_permission_code(p_code text) set search_path to public;
alter function public.retrieval_context_audit_events(p_old retrieval_contexts, p_new retrieval_contexts, p_op text) set search_path to public;
alter function public.retrieval_execution_audit_events(p_old retrieval_executions, p_new retrieval_executions, p_op text) set search_path to public;
alter function public.retrieval_policy_audit_events(p_old retrieval_policies, p_new retrieval_policies, p_op text) set search_path to public;
alter function public.runtime_execution_audit_events(p_old runtime_executions, p_new runtime_executions, p_op text) set search_path to public;
alter function public.runtime_execution_step_audit_events(p_old runtime_execution_steps, p_new runtime_execution_steps, p_op text) set search_path to public;
alter function public.sanitize_provider_connection_configuration(p_configuration jsonb, p_uses_platform_key boolean) set search_path to public;
alter function public.set_updated_at() set search_path to public;
alter function public.snapshot_ai_assistant_settings(p_row ai_assistant_settings) set search_path to public;
alter function public.sync_profile_ids() set search_path to public;
alter function public.tool_definition_audit_events(p_old tool_definitions, p_new tool_definitions, p_op text) set search_path to public;
alter function public.tool_execution_audit_events(p_old tool_executions, p_new tool_executions, p_op text) set search_path to public;
alter function public.trg_entity_set_updated_at() set search_path to public;
alter function public.validate_conversation_company_integrity() set search_path to public;
alter function public.vector_collection_audit_events(p_old vector_collections, p_new vector_collections, p_op text) set search_path to public;
alter function public.vector_query_execution_audit_events(p_old vector_query_executions, p_new vector_query_executions, p_op text) set search_path to public;
alter function public.vector_search_policy_audit_events(p_old vector_search_policies, p_new vector_search_policies, p_op text) set search_path to public;
alter function public.vector_store_connection_audit_events(p_old vector_store_connections, p_new vector_store_connections, p_op text) set search_path to public;
alter function public.whatsapp_is_unchanged_secret(p_value text) set search_path to public;
alter function public.whatsapp_mask_secret(p_hint text, p_has_value boolean) set search_path to public;
alter function public.whatsapp_secret_hint(p_plaintext text) set search_path to public;
alter function public.whatsapp_settings_has_access_token(settings_row company_whatsapp_settings) set search_path to public;
alter function public.whatsapp_settings_has_app_secret(settings_row company_whatsapp_settings) set search_path to public;
alter function public.whatsapp_settings_has_webhook_token(settings_row company_whatsapp_settings) set search_path to public;
alter function public.whatsapp_settings_row_to_public(settings_row company_whatsapp_settings) set search_path to public;

-- ── End 286 ────────────────────────────────────────────────
