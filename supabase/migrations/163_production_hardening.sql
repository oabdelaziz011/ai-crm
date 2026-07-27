-- ============================================================
-- Vault OS – Sprint 7.5.0 Production Hardening & Go-Live Readiness
-- Portal OTP security, document URLs, invoice PDF storage, health RPC
-- ============================================================

-- ── Invoice PDF storage path ─────────────────────────────────

alter table public.invoices
  add column if not exists pdf_storage_path text;

create index if not exists idx_invoices_pdf_path
  on public.invoices(id)
  where pdf_storage_path is not null;

-- ── Portal OTP: dev_code only in non-production ──────────────

create or replace function public.portal_start_auth_challenge(
  p_company_id uuid,
  p_method text,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expires timestamptz := now() + interval '10 minutes';
  v_is_dev boolean := coalesce(current_setting('app.portal_dev_otp', true), 'false') = 'true';
  v_result jsonb;
begin
  insert into public.customer_portal_auth_challenges (
    id, company_id, method, destination, code_hash, expires_at
  ) values (
    v_id, p_company_id, p_method, p_destination,
    encode(digest(v_code, 'sha256'), 'hex'), v_expires
  );

  v_result := jsonb_build_object(
    'challenge_id', v_id,
    'expires_at', v_expires,
    'masked_destination', left(p_destination, 2) || '***' || right(p_destination, 2)
  );

  if v_is_dev then
    v_result := v_result || jsonb_build_object('dev_code', v_code);
  end if;

  return v_result;
end;
$$;

-- ── Portal document signed URL ───────────────────────────────

create or replace function public.portal_get_document_signed_url(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_customer_id uuid;
begin
  select pdf_storage_path, customer_id
  into v_path, v_customer_id
  from public.invoices
  where id = p_document_id;

  if v_path is null then
    return null;
  end if;

  -- Return storage path; client generates signed URL via storage API
  return v_path;
end;
$$;

-- ── Platform health check (migrations 157–162) ───────────────

create or replace function public.platform_health_check_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checks jsonb := '{}'::jsonb;
begin
  v_checks := v_checks || jsonb_build_object(
    'customer_portal', exists(select 1 from information_schema.tables where table_name = 'customer_portal_settings'),
    'financial_platform', exists(select 1 from information_schema.tables where table_name = 'customer_payments'),
    'executive_intelligence', exists(select 1 from information_schema.tables where table_name = 'executive_alerts'),
    'organization_hierarchy', exists(select 1 from information_schema.tables where table_name = 'organization_regions'),
    'integration_hub', exists(select 1 from information_schema.tables where table_name = 'integration_api_keys'),
    'plugin_marketplace', exists(select 1 from information_schema.tables where table_name = 'plugin_registry')
  );

  return jsonb_build_object(
    'status', case when v_checks @> '{"customer_portal":true,"financial_platform":true,"executive_intelligence":true,"organization_hierarchy":true,"integration_hub":true,"plugin_marketplace":true}'::jsonb
      then 'ready' else 'degraded' end,
    'checks', v_checks,
    'checked_at', now()
  );
end;
$$;

grant execute on function public.platform_health_check_v1() to authenticated, service_role;

-- ── Webhook dead-letter retry helper ─────────────────────────

create or replace function public.integration_retry_dead_letter(p_company_id uuid, p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.integration_webhook_deliveries
  set status = 'pending', attempt_count = 0, next_retry_at = null
  where company_id = p_company_id
    and status = 'dead_letter'
    and id in (
      select id from public.integration_webhook_deliveries
      where company_id = p_company_id and status = 'dead_letter'
      order by created_at desc
      limit p_limit
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.integration_retry_dead_letter(uuid, integer) to authenticated, service_role;
