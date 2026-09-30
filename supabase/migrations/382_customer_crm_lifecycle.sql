/**
 * Migration 382 — Customer CRM lifecycle (local-safe, additive).
 *
 * - date_of_birth (editable demographic; customers.age kept for legacy reads)
 * - source (first-touch acquisition; preserved after create)
 * - status (active | inactive | blocked) + latest reason columns
 * - customer_lifecycle_events (append-only immutable trail)
 * - set_customer_lifecycle_status RPC (permission + reason + idempotent)
 *
 * Does NOT rewrite write_audit_log() (preserves 339 branches).
 * Status changes also insert a focused audit_logs row from the RPC.
 *
 * DO NOT apply to production without explicit approval.
 */

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.customers
  add column if not exists date_of_birth date,
  add column if not exists source text,
  add column if not exists status text,
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null;

comment on column public.customers.date_of_birth is
  'Customer date of birth. Age is derived at display time; legacy customers.age is retained read-only.';
comment on column public.customers.source is
  'Acquisition source (first-touch). Never overwrite after create.';
comment on column public.customers.status is
  'CRM lifecycle status: active | inactive | blocked.';
comment on column public.customers.status_reason is
  'Latest inactivation/block reason (lifecycle_events is source of truth for prior reasons).';

update public.customers
set status = 'active'
where status is null;

alter table public.customers
  alter column status set default 'active';

alter table public.customers
  alter column status set not null;

alter table public.customers
  drop constraint if exists customers_status_check;
alter table public.customers
  add constraint customers_status_check
  check (status in ('active', 'inactive', 'blocked'));

alter table public.customers
  drop constraint if exists customers_source_check;
alter table public.customers
  add constraint customers_source_check
  check (
    source is null
    or source in (
      'whatsapp',
      'messenger',
      'instagram',
      'email',
      'sms',
      'website',
      'manual',
      'other'
    )
  );

alter table public.customers
  drop constraint if exists customers_date_of_birth_range;
alter table public.customers
  add constraint customers_date_of_birth_range
  check (
    date_of_birth is null
    or (
      date_of_birth >= date '1900-01-01'
      and date_of_birth <= (current_date + interval '1 day')::date
    )
  );

create index if not exists idx_customers_company_status
  on public.customers (company_id, status)
  where company_id is not null;

create index if not exists idx_customers_company_source
  on public.customers (company_id, source)
  where company_id is not null and source is not null;

-- ── Preserve first-touch source; gate direct status writes ───────────────────

create or replace function public.customers_crm_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Preserve original acquisition source once set.
  if TG_OP = 'UPDATE'
     and old.source is not null
     and new.source is distinct from old.source then
    new.source := old.source;
  end if;

  -- Status transitions must go through set_customer_lifecycle_status RPC.
  if TG_OP = 'UPDATE'
     and old.status is distinct from new.status
     and coalesce(current_setting('app.customer_lifecycle_rpc', true), '') is distinct from '1' then
    raise exception 'STATUS_CHANGE_REQUIRES_RPC'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customers_crm_lifecycle_guard on public.customers;
create trigger trg_customers_crm_lifecycle_guard
  before update on public.customers
  for each row
  execute function public.customers_crm_lifecycle_guard();

-- ── Append-only lifecycle events ────────────────────────────────────────────

create table if not exists public.customer_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  event_type text not null default 'status_changed'
    check (event_type in ('status_changed', 'created')),
  old_status text
    check (old_status is null or old_status in ('active', 'inactive', 'blocked')),
  new_status text not null
    check (new_status in ('active', 'inactive', 'blocked')),
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_lifecycle_events_customer
  on public.customer_lifecycle_events (company_id, customer_id, created_at desc);

comment on table public.customer_lifecycle_events is
  'Append-only customer lifecycle/status history. Never update or delete from app clients.';

alter table public.customer_lifecycle_events enable row level security;

drop policy if exists customer_lifecycle_events_select on public.customer_lifecycle_events;
create policy customer_lifecycle_events_select
  on public.customer_lifecycle_events
  for select
  using (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('customers.view')
    )
  );

revoke all on public.customer_lifecycle_events from anon, authenticated;
grant select on public.customer_lifecycle_events to authenticated;

-- ── RPC ─────────────────────────────────────────────────────────────────────

create or replace function public.set_customer_lifecycle_status(
  p_customer_id uuid,
  p_new_status text,
  p_reason text default null,
  p_expected_status text default null
)
returns public.customers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_actor uuid := auth.uid();
  v_row public.customers;
  v_old_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new text := lower(btrim(coalesce(p_new_status, '')));
  v_expected text := nullif(lower(btrim(coalesce(p_expected_status, ''))), '');
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_new not in ('active', 'inactive', 'blocked') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_permission('customers.edit')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_row
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_company_id := v_row.company_id;
  if v_company_id is null then
    raise exception 'COMPANY_REQUIRED' using errcode = '22023';
  end if;

  if not public.is_super_admin()
     and v_company_id is distinct from public.current_company_id() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_expected is not null and v_row.status is distinct from v_expected then
    raise exception 'STATUS_CONFLICT' using errcode = '40001';
  end if;

  -- Idempotent: same status → no new event
  if v_row.status = v_new then
    return v_row;
  end if;

  if v_new in ('inactive', 'blocked') and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  v_old_status := v_row.status;

  perform set_config('app.customer_lifecycle_rpc', '1', true);

  update public.customers
  set
    status = v_new,
    status_reason = case when v_new = 'active' then null else v_reason end,
    status_changed_at = now(),
    status_changed_by = v_actor,
    updated_at = now()
  where id = p_customer_id
  returning * into v_row;

  insert into public.customer_lifecycle_events (
    company_id,
    customer_id,
    event_type,
    old_status,
    new_status,
    reason,
    changed_by,
    metadata
  ) values (
    v_company_id,
    p_customer_id,
    'status_changed',
    v_old_status,
    v_new,
    case when v_new = 'active' then null else v_reason end,
    v_actor,
    jsonb_build_object('via', 'set_customer_lifecycle_status')
  );

  -- Focused History row (History UI already tracks metadata.old/new.status).
  begin
    insert into public.audit_logs (
      user_id,
      company_id,
      action,
      entity,
      entity_id,
      metadata,
      created_at
    ) values (
      v_actor,
      v_company_id,
      'UPDATE',
      'customers',
      p_customer_id::text,
      jsonb_build_object(
        'old', jsonb_build_object('status', v_old_status),
        'new', jsonb_build_object(
          'status', v_new,
          'status_reason', case when v_new = 'active' then null else v_reason end
        ),
        'lifecycle_event', true,
        'reason', case when v_new = 'active' then null else v_reason end
      ),
      now()
    );
  exception
    when others then
      null;
  end;

  return v_row;
end;
$$;

revoke all on function public.set_customer_lifecycle_status(uuid, text, text, text) from public;
grant execute on function public.set_customer_lifecycle_status(uuid, text, text, text) to authenticated;
