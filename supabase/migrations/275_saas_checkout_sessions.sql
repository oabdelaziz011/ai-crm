-- ============================================================
-- 275 — SaaS online checkout sessions + payment webhook domain
-- ============================================================
-- Part 2: checkout/session storage + verified payment state.
-- Does NOT settle subscriptions (renew / convert / package change).
-- Does NOT touch customer_payments / PaymentService domain.
-- ============================================================

-- ── 1. Ensure sandbox provider exists ─────────────────────────

insert into public.payment_providers (code, display_name, is_active, config)
values ('sandbox', 'Sandbox (Test)', true, '{"mode":"sandbox"}'::jsonb)
on conflict (code) do update
set display_name = excluded.display_name,
    is_active = true;

-- ── 2. billing_checkout_sessions (SaaS only) ─────────────────

create table if not exists public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null references public.company_subscriptions(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  billing_cycle text not null
    check (billing_cycle in ('monthly', 'yearly')),
  provider_code text not null references public.payment_providers(code),
  provider_session_id text,
  checkout_url text,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  status text not null default 'created'
    check (status in ('created', 'pending', 'succeeded', 'failed', 'expired', 'canceled')),
  idempotency_key text,
  return_url text,
  cancel_url text,
  expires_at timestamptz,
  verified_at timestamptz,
  provider_payment_id text,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_billing_checkout_sessions_idempotency
  on public.billing_checkout_sessions (company_id, trim(idempotency_key))
  where idempotency_key is not null
    and length(trim(idempotency_key)) > 0;

create unique index if not exists idx_billing_checkout_sessions_provider_session
  on public.billing_checkout_sessions (
    provider_code,
    trim(provider_session_id)
  )
  where provider_session_id is not null
    and length(trim(provider_session_id)) > 0;

create index if not exists idx_billing_checkout_sessions_company
  on public.billing_checkout_sessions (company_id, created_at desc);

create index if not exists idx_billing_checkout_sessions_status
  on public.billing_checkout_sessions (status, expires_at);

drop trigger if exists billing_checkout_sessions_updated_at on public.billing_checkout_sessions;
create trigger billing_checkout_sessions_updated_at
  before update on public.billing_checkout_sessions
  for each row execute procedure public.set_updated_at();

alter table public.billing_checkout_sessions enable row level security;

drop policy if exists billing_checkout_sessions_select on public.billing_checkout_sessions;
create policy billing_checkout_sessions_select
  on public.billing_checkout_sessions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists billing_checkout_sessions_write on public.billing_checkout_sessions;
create policy billing_checkout_sessions_write
  on public.billing_checkout_sessions for all
  using (false)
  with check (false);

comment on table public.billing_checkout_sessions is
  'Commercial SaaS subscription checkout sessions. Separate from customer payment_intents. Part 2 stores verified payment state; Part 3 settles subscriptions.';

-- ── 3. webhook_events domain extension ───────────────────────

alter table public.webhook_events
  add column if not exists domain text;

update public.webhook_events
set domain = coalesce(nullif(trim(domain), ''), 'unknown')
where domain is null;

alter table public.webhook_events
  alter column domain set default 'unknown';

alter table public.webhook_events
  alter column domain set not null;

alter table public.webhook_events
  drop constraint if exists webhook_events_domain_check;

alter table public.webhook_events
  add constraint webhook_events_domain_check
  check (domain in ('saas_subscription', 'customer_financial', 'unknown'));

alter table public.webhook_events
  add column if not exists checkout_session_id uuid
    references public.billing_checkout_sessions(id) on delete set null;

create unique index if not exists idx_webhook_events_provider_event
  on public.webhook_events (provider_code, trim(provider_event_id))
  where provider_event_id is not null
    and length(trim(provider_event_id)) > 0;

-- ── 4. Create checkout session (price-locked, no provider call) ─

create or replace function public.create_billing_checkout_session_v1(
  p_return_url text,
  p_cancel_url text default null,
  p_idempotency_key text default null,
  p_company_id uuid default null,
  p_provider_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_currency text;
  v_amount numeric;
  v_provider text;
  v_idem text := nullif(trim(p_idempotency_key), '');
  v_existing public.billing_checkout_sessions%rowtype;
  v_session public.billing_checkout_sessions%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() = 'service_role' then
    v_company_id := p_company_id;
    if v_company_id is null then
      raise exception 'company_id is required for service_role checkout creation';
    end if;
  else
    v_company_id := public.current_company_id();
    if v_company_id is null then
      raise exception 'No company context for authenticated user';
    end if;
    if p_company_id is not null and p_company_id <> v_company_id then
      raise exception 'Cannot create checkout for another company';
    end if;
  end if;

  if nullif(trim(p_return_url), '') is null then
    raise exception 'return_url is required';
  end if;

  if v_idem is not null then
    select * into v_existing
    from public.billing_checkout_sessions s
    where s.company_id = v_company_id
      and trim(s.idempotency_key) = v_idem
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'session', to_jsonb(v_existing)
      );
    end if;
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = v_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company';
  end if;

  if v_sub.plan_id is null then
    raise exception 'Subscription has no plan/package';
  end if;

  if v_sub.billing_cycle not in ('monthly', 'yearly') then
    raise exception 'Invalid billing_cycle on subscription';
  end if;

  if v_sub.status = 'canceled' then
    raise exception 'Cannot checkout a canceled subscription';
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  if not found then
    raise exception 'Plan not found';
  end if;

  if v_plan.pricing_mode = 'free' then
    return jsonb_build_object(
      'ok', false,
      'code', 'FREE_PACKAGE_NO_PAYMENT',
      'message', 'Free packages do not require online payment'
    );
  end if;

  if v_plan.pricing_mode = 'custom' then
    return jsonb_build_object(
      'ok', false,
      'code', 'CUSTOM_PRICING_REQUIRES_MANUAL_BILLING',
      'message', 'Custom pricing packages cannot create online checkout without negotiated billing'
    );
  end if;

  if v_plan.pricing_mode <> 'fixed' then
    raise exception 'Unsupported pricing_mode: %', v_plan.pricing_mode;
  end if;

  v_amount := case
    when v_sub.billing_cycle = 'yearly' then v_plan.price_yearly
    else v_plan.price_monthly
  end;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Authoritative package list price is missing or non-positive';
  end if;

  v_currency := coalesce(
    nullif(trim(public.resolve_billing_setting_value('default_currency', v_company_id)#>>'{}'), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
  );
  if v_currency is null then
    raise exception 'default_currency billing setting is not configured';
  end if;

  v_provider := coalesce(
    nullif(trim(p_provider_code), ''),
    public.resolve_active_payment_provider_code(v_company_id)
  );

  if v_provider is null or v_provider = 'manual' then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_ONLINE_PROVIDER_CONFIGURED',
      'message', 'No online payment provider configured (manual provider cannot host checkout)'
    );
  end if;

  if nullif(trim(p_provider_code), '') is not null then
    -- Explicit platform override: provider row must exist (activation gated by server credentials).
    if not exists (select 1 from public.payment_providers pp where pp.code = v_provider) then
      return jsonb_build_object(
        'ok', false,
        'code', 'UNKNOWN_PROVIDER',
        'message', format('Payment provider %s is unknown', v_provider)
      );
    end if;
  elsif not exists (
    select 1 from public.payment_providers pp
    where pp.code = v_provider and pp.is_active = true
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'PROVIDER_INACTIVE',
      'message', format('Payment provider %s is inactive', v_provider)
    );
  end if;

  insert into public.billing_checkout_sessions (
    company_id, subscription_id, plan_id, billing_cycle,
    provider_code, amount, currency, status, idempotency_key,
    return_url, cancel_url, expires_at, metadata, created_by
  )
  values (
    v_company_id, v_sub.id, v_plan.id, v_sub.billing_cycle,
    v_provider, v_amount, v_currency, 'created', v_idem,
    trim(p_return_url), nullif(trim(p_cancel_url), ''),
    v_now + interval '1 hour',
    jsonb_build_object(
      'plan_code', v_plan.code,
      'pricing_mode', v_plan.pricing_mode,
      'amount_locked', true
    ),
    auth.uid()
  )
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'session', to_jsonb(v_session)
  );
exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing
      from public.billing_checkout_sessions s
      where s.company_id = v_company_id
        and trim(s.idempotency_key) = v_idem
      limit 1;
      if found then
        return jsonb_build_object(
          'ok', true,
          'idempotent_replay', true,
          'session', to_jsonb(v_existing)
        );
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) from public;
grant execute on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) to authenticated;
grant execute on function public.create_billing_checkout_session_v1(text, text, text, uuid, text) to service_role;

-- ── 5. Attach provider session after external create ─────────

create or replace function public.attach_billing_checkout_provider_v1(
  p_session_id uuid,
  p_provider_session_id text,
  p_checkout_url text,
  p_provider_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.billing_checkout_sessions%rowtype;
  v_provider_session text := nullif(trim(p_provider_session_id), '');
  v_checkout_url text := nullif(trim(p_checkout_url), '');
begin
  if auth.role() <> 'service_role' and auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  -- Attach is server-side only for production; allow service_role exclusively
  if auth.role() <> 'service_role' then
    raise exception 'Insufficient permissions to attach provider checkout';
  end if;

  if p_session_id is null then
    raise exception 'session_id is required';
  end if;
  if v_provider_session is null then
    raise exception 'provider_session_id is required';
  end if;
  if v_checkout_url is null then
    raise exception 'checkout_url is required';
  end if;

  select * into v_session
  from public.billing_checkout_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Checkout session not found';
  end if;

  if v_session.status not in ('created', 'pending') then
    raise exception 'Checkout session is not attachable (status=%)', v_session.status;
  end if;

  if p_provider_code is not null
     and nullif(trim(p_provider_code), '') is not null
     and trim(p_provider_code) <> v_session.provider_code then
    raise exception 'Provider mismatch for checkout session';
  end if;

  update public.billing_checkout_sessions
  set provider_session_id = v_provider_session,
      checkout_url = v_checkout_url,
      status = 'pending',
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object('ok', true, 'session', to_jsonb(v_session));
end;
$$;

revoke all on function public.attach_billing_checkout_provider_v1(uuid, text, text, text, jsonb) from public;
grant execute on function public.attach_billing_checkout_provider_v1(uuid, text, text, text, jsonb) to service_role;

-- ── 6. Record verified payment event (NO subscription settle) ─

create or replace function public.record_billing_checkout_payment_event_v1(
  p_provider_code text,
  p_provider_event_id text,
  p_event_type text,
  p_normalized_status text,
  p_provider_session_id text default null,
  p_provider_payment_id text default null,
  p_checkout_session_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(trim(p_provider_code));
  v_event_id text := nullif(trim(p_provider_event_id), '');
  v_status text := lower(trim(p_normalized_status));
  v_provider_session text := nullif(trim(p_provider_session_id), '');
  v_provider_payment text := nullif(trim(p_provider_payment_id), '');
  v_idem text := coalesce(
    nullif(trim(p_idempotency_key), ''),
    case when v_event_id is not null then v_provider || ':' || v_event_id else null end
  );
  v_session public.billing_checkout_sessions%rowtype;
  v_webhook_id uuid;
  v_existing_webhook_id uuid;
  v_result_code text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required for payment webhook recording';
  end if;

  if v_provider is null or length(v_provider) = 0 then
    raise exception 'provider_code is required';
  end if;

  if v_status not in ('succeeded', 'failed', 'canceled', 'expired') then
    raise exception 'Invalid normalized_status: %', p_normalized_status;
  end if;

  -- Idempotent webhook row
  if v_idem is not null then
    select we.id into v_existing_webhook_id
    from public.webhook_events we
    where we.provider_code = v_provider
      and we.idempotency_key = v_idem
    limit 1;

    if v_existing_webhook_id is not null then
      select * into v_session
      from public.billing_checkout_sessions s
      where s.id = (
        select checkout_session_id from public.webhook_events where id = v_existing_webhook_id
      );

      return jsonb_build_object(
        'ok', true,
        'code', case
          when v_session.status = 'succeeded' then 'PAYMENT_VERIFIED'
          when v_session.status in ('failed', 'canceled', 'expired') then 'PAYMENT_' || upper(v_session.status)
          else 'WEBHOOK_DUPLICATE'
        end,
        'idempotent_replay', true,
        'webhook_event_id', v_existing_webhook_id,
        'checkout_session_id', v_session.id,
        'session_status', v_session.status,
        'company_id', v_session.company_id,
        'subscription_id', v_session.subscription_id
      );
    end if;
  end if;

  -- Resolve internal session — never trust external company_id
  if p_checkout_session_id is not null then
    select * into v_session
    from public.billing_checkout_sessions
    where id = p_checkout_session_id
    for update;
  elsif v_provider_session is not null then
    select * into v_session
    from public.billing_checkout_sessions
    where provider_code = v_provider
      and trim(provider_session_id) = v_provider_session
    for update;
  end if;

  if v_session.id is null then
    raise exception 'Checkout session not found for verified payment event';
  end if;

  if v_session.provider_code <> v_provider then
    raise exception 'Provider mismatch for checkout session';
  end if;

  -- Already terminal → idempotent
  if v_session.status = 'succeeded' and v_status = 'succeeded' then
    begin
      insert into public.webhook_events (
        provider_code, event_type, provider_event_id, payload, status,
        processed_at, idempotency_key, domain, checkout_session_id
      )
      values (
        v_provider, coalesce(nullif(trim(p_event_type), ''), 'payment.succeeded'),
        v_event_id, coalesce(p_payload, '{}'::jsonb), 'processed',
        now(), v_idem, 'saas_subscription', v_session.id
      )
      returning id into v_webhook_id;
    exception
      when unique_violation then
        select we.id into v_webhook_id
        from public.webhook_events we
        where we.provider_code = v_provider
          and (
            (v_idem is not null and we.idempotency_key = v_idem)
            or (v_event_id is not null and trim(we.provider_event_id) = v_event_id)
          )
        limit 1;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'PAYMENT_VERIFIED',
      'idempotent_replay', true,
      'webhook_event_id', v_webhook_id,
      'checkout_session_id', v_session.id,
      'session_status', v_session.status,
      'company_id', v_session.company_id,
      'subscription_id', v_session.subscription_id,
      'settlement', 'deferred_to_part_3'
    );
  end if;

  if v_status = 'succeeded' then
    update public.billing_checkout_sessions
    set status = 'succeeded',
        verified_at = now(),
        provider_payment_id = coalesce(v_provider_payment, provider_payment_id),
        failure_code = null,
        failure_message = null,
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
    v_result_code := 'PAYMENT_VERIFIED';
  else
    update public.billing_checkout_sessions
    set status = v_status,
        failure_code = coalesce(nullif(trim(p_failure_code), ''), v_status),
        failure_message = nullif(trim(p_failure_message), ''),
        provider_payment_id = coalesce(v_provider_payment, provider_payment_id),
        updated_at = now()
    where id = v_session.id
      and status not in ('succeeded')
    returning * into v_session;
    v_result_code := 'PAYMENT_' || upper(v_status);
  end if;

  begin
    insert into public.webhook_events (
      provider_code, event_type, provider_event_id, payload, status,
      processed_at, idempotency_key, domain, checkout_session_id
    )
    values (
      v_provider,
      coalesce(nullif(trim(p_event_type), ''), 'payment.' || v_status),
      v_event_id,
      coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
        'normalized_status', v_status,
        'checkout_session_id', v_session.id
      ),
      'processed',
      now(),
      v_idem,
      'saas_subscription',
      v_session.id
    )
    returning id into v_webhook_id;
  exception
    when unique_violation then
      select we.id into v_webhook_id
      from public.webhook_events we
      where we.provider_code = v_provider
        and (
          (v_idem is not null and we.idempotency_key = v_idem)
          or (v_event_id is not null and trim(we.provider_event_id) = v_event_id)
        )
      limit 1;

      select * into v_session from public.billing_checkout_sessions where id = v_session.id;

      return jsonb_build_object(
        'ok', true,
        'code', case
          when v_session.status = 'succeeded' then 'PAYMENT_VERIFIED'
          else 'PAYMENT_' || upper(v_session.status)
        end,
        'idempotent_replay', true,
        'webhook_event_id', v_webhook_id,
        'checkout_session_id', v_session.id,
        'session_status', v_session.status,
        'company_id', v_session.company_id,
        'subscription_id', v_session.subscription_id,
        'settlement', 'deferred_to_part_3'
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'code', v_result_code,
    'idempotent_replay', false,
    'webhook_event_id', v_webhook_id,
    'checkout_session_id', v_session.id,
    'session_status', v_session.status,
    'company_id', v_session.company_id,
    'subscription_id', v_session.subscription_id,
    'amount', v_session.amount,
    'currency', v_session.currency,
    'provider_payment_id', v_session.provider_payment_id,
    'settlement', 'deferred_to_part_3'
  );
end;
$$;

revoke all on function public.record_billing_checkout_payment_event_v1(
  text, text, text, text, text, text, uuid, jsonb, text, text, text
) from public;
grant execute on function public.record_billing_checkout_payment_event_v1(
  text, text, text, text, text, text, uuid, jsonb, text, text, text
) to service_role;

comment on function public.record_billing_checkout_payment_event_v1(
  text, text, text, text, text, text, uuid, jsonb, text, text, text
) is
  'Part 2: records verified SaaS payment webhook outcome on billing_checkout_sessions. Does NOT call renew_subscription_from_payment or convert_trial_to_paid_v1.';
