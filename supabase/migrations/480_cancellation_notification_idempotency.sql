-- =============================================================================
-- 480 — Cancellation notification idempotency + customer decision notify metadata
-- Additive / idempotent. Local-only apply via apply-480 script.
-- Does not rewrite 479.
-- =============================================================================

-- DB-enforced dedupe for in-app notifications (nullable; existing rows stay valid).
alter table public.notifications
  add column if not exists idempotency_key text null;

create unique index if not exists notifications_company_user_idempotency_uidx
  on public.notifications (
    company_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    idempotency_key
  )
  where idempotency_key is not null;

comment on column public.notifications.idempotency_key is
  'Optional stable key for idempotent inserts (e.g. order-cancel-notice:…). Unique per company+user when set.';

-- Customer decision notify metadata on cancellation requests (approve/reject).
alter table public.sales_order_cancellation_requests
  add column if not exists customer_notify_status text not null default 'none',
  add column if not exists customer_notify_idempotency_key text null,
  add column if not exists customer_notify_message_id text null,
  add column if not exists customer_notify_error text null,
  add column if not exists customer_notify_attempted_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_order_cancellation_requests_customer_notify_status_check'
  ) then
    alter table public.sales_order_cancellation_requests
      add constraint sales_order_cancellation_requests_customer_notify_status_check
      check (customer_notify_status in ('none', 'pending', 'sent', 'failed', 'skipped', 'dry_run'));
  end if;
end $$;

create unique index if not exists sales_order_cancellation_requests_customer_notify_idem_uidx
  on public.sales_order_cancellation_requests (company_id, customer_notify_idempotency_key)
  where customer_notify_idempotency_key is not null;
