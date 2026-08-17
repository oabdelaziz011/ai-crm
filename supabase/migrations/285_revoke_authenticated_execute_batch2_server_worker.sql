-- ============================================================
-- 285 — Phase 2 Batch 2: revoke authenticated EXECUTE from
-- proven SERVER / WORKER / BACKEND-only SECURITY DEFINER functions.
--
-- Scope (exact live-verified signatures only — 6 functions):
--   - claim_embedding_jobs / recover_stale_embedding_jobs
--   - update_company_email_imap_cursor
--   - record_company_whatsapp_credential_health
--   - attach_billing_checkout_provider_v1
--   - record_billing_checkout_payment_event_v1
--
-- Does NOT touch:
--   - pgvector_* , publish_automation_workflow_version
--   - platform_resolve_ai_runtime_config / platform_ai_feature_enabled
--   - financial_compute_analytics_snapshot_v1 / integration_retry_dead_letter
--   - enforce_*_v1 / build_billing_*_snapshot
--   - deferred NEEDS REVIEW / KEEP authenticated RPCs
--   - intentional anon portal RPCs
--   - function bodies, triggers, search_path, or business logic
--
-- For each target: REVOKE EXECUTE FROM authenticated only.
-- service_role / postgres preserved. No PUBLIC EXECUTE on these targets.
-- ============================================================

-- public.claim_embedding_jobs(p_company_id uuid, p_limit integer, p_worker_id text)
revoke execute on function public.claim_embedding_jobs(p_company_id uuid, p_limit integer, p_worker_id text) from authenticated;

-- public.recover_stale_embedding_jobs(p_stale_seconds integer)
revoke execute on function public.recover_stale_embedding_jobs(p_stale_seconds integer) from authenticated;

-- public.update_company_email_imap_cursor(p_company_id uuid, p_last_uid bigint)
revoke execute on function public.update_company_email_imap_cursor(p_company_id uuid, p_last_uid bigint) from authenticated;

-- public.record_company_whatsapp_credential_health(...)
revoke execute on function public.record_company_whatsapp_credential_health(
  p_company_id uuid,
  p_token_status text,
  p_token_expires_at timestamp with time zone,
  p_clear_token_expires_at boolean,
  p_token_checked_at timestamp with time zone,
  p_last_successful_send_at timestamp with time zone,
  p_last_auth_error text,
  p_clear_last_auth_error boolean,
  p_last_auth_error_at timestamp with time zone,
  p_last_auth_error_code integer,
  p_clear_last_auth_error_code boolean
) from authenticated;

-- public.attach_billing_checkout_provider_v1(...)
revoke execute on function public.attach_billing_checkout_provider_v1(
  p_session_id uuid,
  p_provider_session_id text,
  p_checkout_url text,
  p_provider_code text,
  p_metadata jsonb
) from authenticated;

-- public.record_billing_checkout_payment_event_v1(...)
revoke execute on function public.record_billing_checkout_payment_event_v1(
  p_provider_code text,
  p_provider_event_id text,
  p_event_type text,
  p_normalized_status text,
  p_provider_session_id text,
  p_provider_payment_id text,
  p_checkout_session_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_failure_code text,
  p_failure_message text
) from authenticated;

-- ── End Phase 2 Batch 2 ─────────────────────────────────────
