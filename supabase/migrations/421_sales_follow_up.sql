-- Tenant sales follow-up settings, attempt audit, and claimable due jobs.
-- Existing companies stay disabled: enabled defaults to false and approval_mode to draft.
-- Delivery must go through the existing outbound providers after a fresh eligibility check.
-- Apply only against local/dev databases — never production from agent tooling.

create table if not exists public.sales_follow_up_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  channels text[] not null default '{}',
  first_delay_minutes integer not null default 1440,
  subsequent_interval_minutes integer[] not null default '{}',
  max_attempts integer not null default 1,
  timezone text not null default 'UTC',
  business_hours jsonb not null default '{"start":"09:00","end":"17:00","days":[1,2,3,4,5]}'::jsonb,
  approval_mode text not null default 'draft',
  stop_on_customer_reply boolean not null default true,
  stop_on_conversion boolean not null default true,
  stop_on_purchase boolean not null default true,
  stop_on_opt_out boolean not null default true,
  stop_on_closed_request boolean not null default true,
  stop_on_reassignment boolean not null default true,
  company_daily_limit integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_follow_up_settings_approval_mode_check check (approval_mode in ('draft', 'automatic')),
  constraint sales_follow_up_settings_max_attempts_check check (max_attempts between 1 and 5),
  constraint sales_follow_up_settings_daily_limit_check check (company_daily_limit between 1 and 500)
);

create table if not exists public.sales_follow_up_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  conversation_id uuid null,
  idempotency_key text not null,
  channel text,
  outcome text not null,
  reason text not null,
  provider_message_id text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_follow_up_attempts_outcome_check
    check (outcome in ('scheduled', 'sent', 'draft', 'skipped', 'failed', 'cancelled', 'retried')),
  constraint sales_follow_up_attempts_idempotency_key unique (idempotency_key)
);

create index if not exists sales_follow_up_attempts_company_lead_idx
  on public.sales_follow_up_attempts (company_id, lead_id, created_at desc);

-- Claimable work queue. Unique idempotency_key prevents duplicate sends across workers.
create table if not exists public.sales_follow_up_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  conversation_id uuid null,
  company_channel_id uuid null,
  external_thread_id text null,
  channel text null,
  attempt_number integer not null default 1,
  due_at timestamptz not null,
  message_text text not null default '',
  idempotency_key text not null,
  status text not null default 'pending',
  claim_owner text null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  last_outcome text null,
  provider_message_id text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_follow_up_jobs_status_check
    check (status in ('pending', 'claimed', 'completed', 'cancelled')),
  constraint sales_follow_up_jobs_attempt_number_check
    check (attempt_number between 1 and 20),
  constraint sales_follow_up_jobs_idempotency_key unique (idempotency_key)
);

create index if not exists sales_follow_up_jobs_due_pending_idx
  on public.sales_follow_up_jobs (due_at asc)
  where status = 'pending';

create index if not exists sales_follow_up_jobs_claim_expiry_idx
  on public.sales_follow_up_jobs (claim_expires_at asc)
  where status = 'claimed';

create index if not exists sales_follow_up_jobs_company_idx
  on public.sales_follow_up_jobs (company_id, status, due_at);

alter table public.sales_follow_up_settings enable row level security;
alter table public.sales_follow_up_attempts enable row level security;
alter table public.sales_follow_up_jobs enable row level security;

drop policy if exists sales_follow_up_settings_company on public.sales_follow_up_settings;
create policy sales_follow_up_settings_company
  on public.sales_follow_up_settings
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists sales_follow_up_attempts_company on public.sales_follow_up_attempts;
create policy sales_follow_up_attempts_company
  on public.sales_follow_up_attempts
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists sales_follow_up_jobs_company on public.sales_follow_up_jobs;
create policy sales_follow_up_jobs_company
  on public.sales_follow_up_jobs
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

revoke all on table public.sales_follow_up_settings from anon, public;
revoke all on table public.sales_follow_up_attempts from anon, public;
revoke all on table public.sales_follow_up_jobs from anon, public;

grant select, insert, update on table public.sales_follow_up_settings to authenticated;
grant select, insert, update on table public.sales_follow_up_attempts to authenticated;
grant select, insert, update on table public.sales_follow_up_jobs to authenticated;

grant select, insert, update on table public.sales_follow_up_settings to service_role;
grant select, insert, update on table public.sales_follow_up_attempts to service_role;
grant select, insert, update on table public.sales_follow_up_jobs to service_role;

-- Atomically claim due (or expired-claim) jobs for enabled companies only.
create or replace function public.claim_sales_follow_up_jobs(
  p_limit integer default 25,
  p_claim_owner text default null,
  p_lease_seconds integer default 120
)
returns setof public.sales_follow_up_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_owner text := coalesce(nullif(trim(p_claim_owner), ''), 'worker');
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  return query
  with candidates as (
    select j.id
    from public.sales_follow_up_jobs j
    inner join public.sales_follow_up_settings s
      on s.company_id = j.company_id
     and s.enabled = true
    where (
      (j.status = 'pending' and j.due_at <= now())
      or (j.status = 'claimed' and j.claim_expires_at is not null and j.claim_expires_at < now())
    )
    order by j.due_at asc
    limit v_limit
    for update of j skip locked
  )
  update public.sales_follow_up_jobs j
  set
    status = 'claimed',
    claim_owner = v_owner,
    claimed_at = now(),
    claim_expires_at = now() + make_interval(secs => v_lease),
    updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_sales_follow_up_jobs(integer, text, integer) from public, anon;
grant execute on function public.claim_sales_follow_up_jobs(integer, text, integer) to service_role;
grant execute on function public.claim_sales_follow_up_jobs(integer, text, integer) to authenticated;
